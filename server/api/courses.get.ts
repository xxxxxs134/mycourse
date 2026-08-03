import { db, courses, orders, redis, eq, and } from '../db'
import { withCache } from '../utils/cache'
import { readCustomerUid } from '../utils/auth'

const CACHE_KEY = 'courses:list'
const CACHE_TTL = 60

export default defineEventHandler(async (event) => {
  const customerUid = await readCustomerUid(event)
  const query = getQuery(event)
  const categoryFilter = typeof query.category === 'string' && query.category ? query.category : undefined

  const cacheKey = categoryFilter ? `${CACHE_KEY}:cat:${categoryFilter}` : CACHE_KEY

  const list = await withCache(cacheKey, CACHE_TTL, async () => {
    if (categoryFilter) {
      return db.select().from(courses)
        .where(and(eq(courses.onSale, true), eq(courses.category, categoryFilter)))
    }
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
  if (customerUid !== null) {
    const paid = await db.select({ courseId: orders.courseId }).from(orders)
      .where(and(
        eq(orders.paid, true),
        eq(orders.userId, customerUid)
      ))
    for (const row of paid) unlockedIds.add(row.courseId)
  }

  return (list ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    price: course.price,
    stock: stockMap.get(course.id) ?? course.stock,
    category: course.category ?? '',
    cover: course.cover ?? '',
    unlocked: unlockedIds.has(course.id)
  }))
})
