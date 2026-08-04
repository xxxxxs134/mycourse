import { sql, like, and, inArray } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { withCache } from '../utils/cache'
import { readCustomerUid } from '../utils/auth'

const CACHE_KEY = 'courses:list'
const CACHE_TTL = 60

export default defineEventHandler(async (event) => {
  const customerUid = await readCustomerUid(event)
  const query = getQuery(event)
  const categoryFilter = typeof query.category === 'string' && query.category ? query.category : undefined
  const search = typeof query.q === 'string' && query.q.trim() ? query.q.trim().toLowerCase() : undefined

  // 缓存 key 必须包含全部查询条件，避免不同搜索/分类串缓存
  const parts = [CACHE_KEY]
  if (categoryFilter) parts.push(`cat:${categoryFilter}`)
  if (search) parts.push(`q:${search}`)
  const cacheKey = parts.join(':')

  const list = await withCache(cacheKey, CACHE_TTL, async () => {
    const conditions = [eq(courses.onSale, true)]
    if (categoryFilter) conditions.push(eq(courses.category, categoryFilter))
    if (search) conditions.push(like(sql`lower(${courses.title})`, `%${search}%`))
    return db.select().from(courses).where(and(...conditions))
  })

  const stockMap = new Map<number, number>()
  const soldMap = new Map<number, number>()
  if (list && list.length > 0) {
    const ids = list.map((c) => c.id)
    const stockKeys = ids.map((id) => `stock:${id}`)
    const stockValues = await redis.mget(stockKeys)
    list.forEach((course, i) => {
      const v = stockValues[i]
      if (v !== null && v !== undefined) stockMap.set(course.id, Number(v))
    })

    // 已售数：paid 订单按课程聚合
    const soldAgg = await db.select({
      courseId: orders.courseId,
      count: sql<number>`count(*)`
    }).from(orders)
      .where(and(eq(orders.paid, true), inArray(orders.courseId, ids)))
      .groupBy(orders.courseId)
    for (const row of soldAgg) soldMap.set(row.courseId, Number(row.count))
  }

  const unlockedIds = new Set<number>()
  if (customerUid !== null) {
    const paid = await db.select({ courseId: orders.courseId }).from(orders)
      .where(and(eq(orders.paid, true), eq(orders.userId, customerUid)))
    for (const row of paid) unlockedIds.add(row.courseId)
  }

  return (list ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    price: course.price,
    stock: stockMap.get(course.id) ?? course.stock,
    sold: soldMap.get(course.id) ?? 0,
    category: course.category ?? '',
    cover: course.cover ?? '',
    unlocked: unlockedIds.has(course.id)
  }))
})
