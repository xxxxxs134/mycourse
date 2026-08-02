import { db, courses, orders, eq, and, inArray } from '../db'
import { withCache } from '../utils/cache'

const CACHE_KEY = 'courses:list'
const CACHE_TTL = 60

export default defineEventHandler(async (event) => {
  const orderIds = (getHeader(event, 'x-order-ids') || '').split(',').filter(Boolean)

  const list = await withCache(CACHE_KEY, CACHE_TTL, async () => {
    return db.select().from(courses)
  })

  const unlockedIds = new Set<number>()
  if (orderIds.length > 0) {
    const paid = await db.select({ courseId: orders.courseId }).from(orders)
      .where(and(
        eq(orders.paid, true),
        inArray(orders.orderId, orderIds)
      ))
    for (const row of paid) unlockedIds.add(row.courseId)
  }

  return (list ?? []).map((course: any) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    price: course.price,
    stock: course.stock,
    unlocked: unlockedIds.has(course.id)
  }))
})
