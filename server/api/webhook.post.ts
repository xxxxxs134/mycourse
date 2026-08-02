import { db, orders, eq, redis } from '../db'
import { verifyCallback, parseOrderId, detectChannel } from '../utils/payments'

const PAID_TTL = 86400

export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event))!
  const headers = {
    'x-pay-channel': getHeader(event, 'x-pay-channel') || undefined,
    'stripe-signature': getHeader(event, 'stripe-signature') || undefined,
    timestamp: getHeader(event, 'wechatpay-timestamp') || undefined,
    nonce: getHeader(event, 'wechatpay-nonce') || undefined,
    signature: getHeader(event, 'wechatpay-signature') || undefined,
  }

  let channel: string
  try {
    channel = verifyCallback(headers, rawBody)
  } catch (e: any) {
    throw createError({ statusCode: 401, statusMessage: e?.message || '回调签名验证失败' })
  }

  const orderId = parseOrderId(headers, rawBody)
  const released = await redis.get(`order:${orderId}:released`)
  if (released) {
    throw createError({ statusCode: 400, statusMessage: '订单已超时关闭，请联系重新下单' })
  }

  const cacheKey = `order:${orderId}:paid`

  const first = await redis.set(cacheKey, '1', 'EX', PAID_TTL, 'NX')
  if (first === null) {
    return { received: true, channel, duplicate: true }
  }

  await db.update(orders)
    .set({ paid: true })
    .where(eq(orders.orderId, orderId))
  return { received: true, channel }
})
