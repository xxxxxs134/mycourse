import { sql, lt } from 'drizzle-orm'
import { db, orders, courses, redis, eq, and } from '../db'

export const ORDER_TTL_SECONDS = Number(process.env.ORDER_TTL_SECONDS) || 5 * 60
const RELEASE_MARK_TTL = 86400
const BATCH_SIZE = 50

export async function releaseExpiredOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_TTL_SECONDS * 1000)
  const expired = await db.select().from(orders)
    .where(and(eq(orders.paid, false), lt(orders.createdAt, cutoff)))
    .limit(BATCH_SIZE)

  let released = 0
  for (const order of expired) {
    if (await redis.exists(`order:${order.orderId}:paid`)) continue
    const markKey = `order:${order.orderId}:released`
    const claimed = await redis.set(markKey, '1', 'EX', RELEASE_MARK_TTL, 'NX')
    if (claimed === null) continue

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
