import { redis } from '../db'
import type { Redis } from 'ioredis'

export const PAY_QUEUE = 'pay_queue'
export const PAY_GROUP = 'pay_workers'
export const PAY_DEAD = 'pay_dead'

/** 等待 Redis 连接就绪（带超时）。worker 独立连接（workerRedis）在 nitro worker
 *  进程启动瞬间尚未 ready，直接发命令会报 "Stream isn't writeable"，导致消费循环
 *  启动失败。启动前先等 ready。 */
export async function waitRedisReady(client: Redis, timeoutMs = 5000): Promise<boolean> {
  if (client.status === 'ready') return true
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.off('ready', onReady)
      resolve(false)
    }, timeoutMs)
    const onReady = () => {
      clearTimeout(timer)
      resolve(true)
    }
    client.once('ready', onReady)
  })
}

let streamSupported: boolean | null = null

/** 检测 Redis 是否支持 Stream（需 ≥5.0）。结果缓存。 */
export async function isStreamSupported(): Promise<boolean> {
  if (streamSupported === true) return true
  try {
    // 等待 Redis 连接就绪（避免启动时序导致误判）
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      await new Promise<void>((resolve) => {
        const onReady = () => { redis.off('ready', onReady); resolve() }
        redis.once('ready', onReady)
        if (redis.status === 'ready') resolve()
      })
    }
    const info = await redis.info('server')
    const m = info.match(/redis_version:(\d+)\./)
    streamSupported = m ? Number(m[1]) >= 5 : false
  } catch (e: any) {
    console.warn('[payQueue] Redis info 检测异常（不缓存，下次重试）:', e?.message || e)
    streamSupported = null
  }
  return streamSupported === true
}

/** 入队支付确认任务（含金额，供 worker 校验）；Stream 不支持时返回 false（调用方回退同步处理） */
export async function enqueuePayment(orderId: string, channel: string, amount: number): Promise<boolean> {
  if (!(await isStreamSupported())) return false
  await redis.xadd(PAY_QUEUE, '*', 'orderId', orderId, 'channel', channel, 'amount', String(amount))
  return true
}

/** 确保消费组存在（worker 启动时调用） */
export async function ensureGroup(): Promise<void> {
  if (!(await isStreamSupported())) return
  try {
    await redis.xgroup('CREATE', PAY_QUEUE, PAY_GROUP, '0', 'MKSTREAM')
  } catch (e: any) {
    // BUSYGROUP 已存在则忽略
    if (!String(e?.message).includes('BUSYGROUP')) throw e
  }
}
