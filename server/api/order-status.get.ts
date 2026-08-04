import { db, orders, eq, redis } from '../db'
import { orderExists } from '../utils/stock'
import { readCustomerUid } from '../utils/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const orderId = String(query.orderId || '')

  // 只接受 UUID 格式，防止枚举/异常探测
  if (!UUID_RE.test(orderId)) {
    throw createError({ statusCode: 404, message: '订单不存在' })
  }

  const state = await redis.get(`order:${orderId}:state`)
  if (state === 'PAID') {
    return { paid: true, released: false }
  }
  if (state === 'RELEASED') {
    return { paid: false, released: true }
  }

  if (await orderExists(orderId)) {
    // 待支付订单：校验归属（若非本人且订单有归属，拒绝）
    const uid = await readCustomerUid(event)
    if (uid !== null) {
      const [o] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.orderId, orderId)).limit(1)
      // 历史匿名订单（userId NULL）放行；新订单校验归属
      if (o && o.userId !== null && o.userId !== uid) {
        throw createError({ statusCode: 404, message: '订单不存在' })
      }
    }
    return { paid: false, released: false }
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1)
  if (!order) {
    throw createError({ statusCode: 404, message: '订单不存在' })
  }

  // 已支付/已释放订单：校验归属（匿名 NULL 放行）
  const uid = await readCustomerUid(event)
  if (uid !== null && order.userId !== null && order.userId !== uid) {
    throw createError({ statusCode: 404, message: '订单不存在' })
  }

  return { paid: order.paid, released: order.released }
})
