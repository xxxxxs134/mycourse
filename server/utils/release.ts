import { sql, lt } from 'drizzle-orm'
import { db, orders, courses, redis, eq, and } from '../db'

export const ORDER_TTL_SECONDS = Number(process.env.ORDER_TTL_SECONDS) || 5 * 60
const STATE_KEY_TTL = 86400
const BATCH_SIZE = 50

export async function releaseExpiredOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_TTL_SECONDS * 1000)
  const expired = await db.select().from(orders)
    .where(and(eq(orders.paid, false), eq(orders.released, false), lt(orders.createdAt, cutoff)))
    .limit(BATCH_SIZE)

  let released = 0
  for (const order of expired) {
    const stateKey = `order:${order.orderId}:state`
    const current = await redis.get(stateKey)
    if (current === 'PAID') continue

    if (current === null) {
      await redis.set(stateKey, 'RELEASED', 'EX', STATE_KEY_TTL, 'NX')
    }

    const result = await db.update(orders)
      .set({ released: true })
      .where(and(
        eq(orders.orderId, order.orderId),
        eq(orders.paid, false),
        eq(orders.released, false)
      ))
    if (result[0].affectedRows === 0) continue

    const stockKey = `stock:${order.courseId}`
    if (await redis.exists(stockKey)) {
      await redis.incr(stockKey)
    }
    await db.update(courses)
      .set({ stock: sql`${courses.stock} + 1` })
      .where(eq(courses.id, order.courseId))
    released++
  }

  if (released > 0) {
    await redis.del('courses:list')
  }
  return released
}
