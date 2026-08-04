import { redis } from '../db'
import { verifyCallback, parseCallbackData } from '../utils/payments'
import { enqueuePayment } from '../utils/payQueue'
import { confirmPayment } from '../utils/paymentConfirm'

const PAID_TTL = 86400

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, message: '回调内容为空' })
  }
  const headers = {
    'x-pay-channel': getHeader(event, 'x-pay-channel') || undefined,
    'stripe-signature': getHeader(event, 'stripe-signature') || undefined,
    timestamp: getHeader(event, 'wechatpay-timestamp') || undefined,
    nonce: getHeader(event, 'wechatpay-nonce') || undefined,
    signature: getHeader(event, 'wechatpay-signature') || undefined,
  }

  let channel: string
  let callback: { orderId: string, transactionId: string | null, amount: number }
  try {
    channel = verifyCallback(headers, rawBody)
    callback = parseCallbackData(headers, rawBody)
  } catch (e: any) {
    // 不向客户端暴露验签内部细节（渠道/签名实现），详情入日志
    console.warn('[webhook] 回调验证失败:', e?.message || e)
    throw createError({ statusCode: 401, message: '回调签名验证失败' })
  }

  const orderId = callback.orderId
  const stateKey = `order:${orderId}:state`

  // 幂等抢占：同一订单只入队/处理一次
  const first = await redis.set(stateKey, 'PAID', 'EX', PAID_TTL, 'NX')
  if (first === null) {
    const state = await redis.get(stateKey)
    if (state === 'RELEASED') {
      // 订单已超时释放但支付回调到达（release 与支付竞态）。
      // 保持拒绝，避免「已释放订单」被误标 paid 造成库存错误。
      // 记录到待处理集合，供运维查询并人工退款。
      console.warn(`[webhook] 已释放订单收到回调: ${orderId}`)
      await redis.zadd('released_paid:orders', Date.now(), orderId).catch(() => {})
      throw createError({ statusCode: 400, message: '订单已超时关闭，请联系重新下单' })
    }
    return { received: true, channel, duplicate: true }
  }

  // 异步化：入队后立即返回 200（支付平台不再等待落库）。
  // 订单确认由 paymentWorker 消费 pay_queue 异步完成（幂等）。
  const queued = await enqueuePayment(orderId, channel, callback.amount)
  if (queued) {
    return { received: true, channel, async: true }
  }

  // Stream 不可用（Redis <5）：回退同步确认，保证兼容与功能正确
  try {
    const result = await confirmPayment({
      orderId,
      channel,
      transactionId: callback.transactionId,
      callbackAmount: callback.amount
    })
    if (!result.ok) {
      // 同步确认失败：释放 state key 允许重试
      await redis.del(stateKey).catch(() => {})
      throw createError({ statusCode: 400, message: result.error || '订单确认失败' })
    }
    return { received: true, channel, async: false, duplicate: result.duplicate }
  } catch (e: any) {
    if (e?.statusCode) throw e
    console.warn(`[webhook] 同步确认失败: ${orderId}:`, e?.message || e)
    await redis.del(stateKey).catch(() => {})
    throw createError({ statusCode: 500, message: '服务内部错误' })
  }
})
