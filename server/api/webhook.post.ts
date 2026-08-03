import { db, orders, eq, redis, orderPayments } from '../db'
import { verifyCallback, parseCallbackData } from '../utils/payments'
import { getPendingOrder, removePending, removeOrder } from '../utils/stock'

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
    throw createError({ statusCode: 401, message: e?.message || '回调签名验证失败' })
  }

  const orderId = callback.orderId
  const stateKey = `order:${orderId}:state`

  const first = await redis.set(stateKey, 'PAID', 'EX', PAID_TTL, 'NX')
  if (first === null) {
    const state = await redis.get(stateKey)
    if (state === 'RELEASED') {
      throw createError({ statusCode: 400, message: '订单已超时关闭，请联系重新下单' })
    }
    return { received: true, channel, duplicate: true }
  }

  let claimed = true
  try {
    const transactionId = callback.transactionId ?? `txn_${orderId}_${Date.now()}`
    const callbackAmount = callback.amount

    const pending = await getPendingOrder(orderId)
    if (!pending) {
      throw createError({ statusCode: 400, message: '订单不存在或已超时，请联系重新下单' })
    }

    if (callbackAmount !== pending.amount) {
      throw createError({ statusCode: 400, message: '支付金额与订单金额不符' })
    }

    let duplicate = false
    try {
      await db.transaction(async (tx) => {
        await tx.insert(orderPayments).values({
          orderId,
          transactionId,
          channel,
          amount: pending.amount,
          createdAt: new Date()
        })
        await tx.insert(orders).values({
          courseId: pending.courseId,
          orderId,
          amount: pending.amount,
          channel: pending.channel,
          paid: true,
          released: false,
          createdAt: new Date(pending.createdAt)
        })
      })
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_ENTRY') {
        throw err
      }
      duplicate = true
    }

    await removePending(pending.courseId, orderId)
    await removeOrder(orderId)
    await redis.del(`course:${pending.courseId}:meta`)

    claimed = false
    if (duplicate) {
      return { received: true, channel, duplicate }
    }
    return { received: true, channel }
  } finally {
    if (claimed) {
      await redis.del(stateKey).catch(() => {})
    }
  }
})
