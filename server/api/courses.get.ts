import { db, courses, orders, redis, eq, and, inArray } from '../db'
import { withCache } from '../utils/cache'

const CACHE_KEY = 'courses:list'
const CACHE_TTL = 60

const MAX_ORDER_IDS = 100

export default defineEventHandler(async (event) => {
  const orderIds = (getHeader(event, 'x-order-ids') || '').split(',').filter(Boolean).slice(0, MAX_ORDER_IDS)

  const list = await withCache(CACHE_KEY, CACHE_TTL, async () => {
    return db.select().from(courses)
      .where(eq(courses.onSale, true))
  })

  const stockMap = new Map<number, number>()
  if (list && list.length > 0) {
    const keys = list.map((c) => `stock:${c.id}`)
    const values = await redis.mget(keys)
    list.forEach((course, i) => {
      const v = values[i]
      if (v !== null && v !== undefined) stockMap.set(course.id, Number(v))
    })
  }

  const unlockedIds = new Set<number>()
  if (orderIds.length > 0) {
    const paid = await db.select({ courseId: orders.courseId }).from(orders)
      .where(and(
        eq(orders.paid, true),
        inArray(orders.orderId, orderIds)
      ))
    for (const row of paid) unlockedIds.add(row.courseId)
  }

  return (list ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    price: course.price,
    stock: stockMap.get(course.id) ?? course.stock,
    unlocked: unlockedIds.has(course.id)
  }))
})
