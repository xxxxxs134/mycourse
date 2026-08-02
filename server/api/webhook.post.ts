import { db, orders, eq, redis,orderPayments } from '../db'
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
    throw createError({ statusCode: 401, message: e?.message || '回调签名验证失败' })
  }

  const orderId = parseOrderId(headers, rawBody)
  const stateKey = `order:${orderId}:state`

  const first = await redis.set(stateKey, 'PAID', 'EX', PAID_TTL, 'NX')
  if (first === null) {
    const state = await redis.get(stateKey)
    if (state === 'RELEASED') {
      throw createError({ statusCode: 400, message: '订单已超时关闭，请联系重新下单' })
    }
    return { received: true, channel, duplicate: true }
  }

  const parsed = JSON.parse(rawBody)
  const transactionId = parsed.transaction_id ?? `txn_${orderId}_${Date.now()}`
  const amount = Number(parsed.amount) || 0

  let duplicate = false
  try {
    await db.insert(orderPayments).values({
      orderId,
      transactionId,
      channel,
      amount,
      createdAt: new Date()
    })
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_ENTRY') {
      await redis.del(stateKey)
      throw err
    }
    duplicate = true
  }

  await db.update(orders).set({ paid: true }).where(eq(orders.orderId, orderId))
  if (duplicate) {
    return { received: true, channel, duplicate }
  }
  return { received: true, channel }
})
