import { db, orders, eq, redis, orderPayments } from '../db'
import { verifyCallback, parseCallbackData } from '../utils/payments'
import { getPendingOrder, removePending, removeOrder, incrSold } from '../utils/stock'
import { recordMovement } from '../utils/stockMovement'
import { invalidateCourseList } from '../utils/cache'

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

  let claimed = true
  try {
    const transactionId = callback.transactionId ?? `txn_${orderId}`
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
          userId: pending.userId,
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
    await invalidateCourseList()

    // 支付确认 = 订单从「预扣」转为「已售」，库存不变（checkout 时已 DECR）。
    // 流水记数量 0、before/after 均为当前库存，反映状态转移而非库存变动。
    if (!duplicate) {
      const current = Number(await redis.get(`stock:${pending.courseId}`)) || 0
      await recordMovement({
        courseId: pending.courseId,
        type: 'sale',
        quantity: 0,
        beforeQty: current,
        remark: `订单 ${orderId} 支付成功`
      })
      await incrSold(pending.courseId)
    }

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
