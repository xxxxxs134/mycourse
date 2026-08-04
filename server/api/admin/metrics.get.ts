import { redis } from '../../db'
import { requireAdmin } from '../../utils/auth'
import { PAY_QUEUE, PAY_DEAD, isStreamSupported } from '../../utils/payQueue'

const PAY_SUCCESS_KEY = 'metrics:pay_success'
const PAY_SUCCESS_WINDOW_MS = 60_000

// 运维指标：队列积压、支付成功数、累计订单数、Redis 状态
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const streamOk = await isStreamSupported()
  const now = Date.now()

  const [totalOrders, queueLen, deadLen, paySuccess] = await Promise.all([
    redis.get('metrics:total_orders').then((v) => Number(v) || 0).catch(() => 0),
    streamOk ? redis.xlen(PAY_QUEUE).catch(() => 0) : -1,
    streamOk ? redis.xlen(PAY_DEAD).catch(() => 0) : -1,
    streamOk
      ? redis.zcount(PAY_SUCCESS_KEY, now - PAY_SUCCESS_WINDOW_MS, now).catch(() => 0)
      : redis.zcard(PAY_SUCCESS_KEY).catch(() => 0),
  ])

  return {
    streamSupported: streamOk,
    totalOrders,
    queueLength: queueLen, // -1 = Redis 不支持 Stream（回退同步模式）
    deadLetterLength: deadLen,
    paySuccessLastMinute: paySuccess,
    redisVersion: (await redis.info('server').catch(() => '')).match(/redis_version:(\S+)/)?.[1] ?? 'unknown',
  }
})
