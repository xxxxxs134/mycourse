import { redis } from '../db'

export const PAY_QUEUE = 'pay_queue'
export const PAY_GROUP = 'pay_workers'
export const PAY_DEAD = 'pay_dead'

let streamSupported: boolean | null = null

/** 检测 Redis 是否支持 Stream（需 ≥5.0）。结果缓存。 */
export async function isStreamSupported(): Promise<boolean> {
  if (streamSupported !== null) return streamSupported
  try {
    const info = await redis.info('server')
    const m = info.match(/redis_version:(\d+)\./)
    streamSupported = m ? Number(m[1]) >= 5 : false
  } catch {
    streamSupported = false
  }
  return streamSupported
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
