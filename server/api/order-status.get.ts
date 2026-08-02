import { db, orders, eq, redis } from '../db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const orderId = String(query.orderId)

  const cached = await redis.get(`order:${orderId}:paid`)
  if (cached !== null) {
    return { paid: cached === '1' }
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: '订单不存在' })
  }
  return { paid: order.paid }
})
