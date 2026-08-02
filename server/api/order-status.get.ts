import { db, orders, eq, redis } from '../db'
import { orderExists } from '../utils/stock'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const orderId = String(query.orderId)

  const state = await redis.get(`order:${orderId}:state`)
  if (state === 'PAID') {
    return { paid: true, released: false }
  }
  if (state === 'RELEASED') {
    return { paid: false, released: true }
  }

  if (await orderExists(orderId)) {
    return { paid: false, released: false }
  }

  const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1)
  if (!order) {
    throw createError({ statusCode: 404, message: '订单不存在' })
  }
  return { paid: order.paid, released: order.released }
})
