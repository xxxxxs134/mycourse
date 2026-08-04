import { sql, like, and, inArray } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { withCache } from '../utils/cache'
import { readCustomerUid } from '../utils/auth'

const CACHE_KEY = 'courses:list'
const CACHE_TTL = 10

type CourseListItem = {
  id: number
  title: string
  description: string
  price: number
  stock: number
  sold: number
  category: string
  cover: string
  unlocked: boolean
}

/** 构建课程列表（含 stock/sold 实时数据），缓存公共部分；unlocked 按用户单独填充 */
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

  const list = await withCache<CourseListItem[]>(cacheKey, CACHE_TTL, async () => {
    const conditions = [eq(courses.onSale, true)]
    if (categoryFilter) conditions.push(eq(courses.category, categoryFilter))
    if (search) conditions.push(like(sql`lower(${courses.title})`, `%${search}%`))
    const rows = await db.select().from(courses).where(and(...conditions))

    const stockMap = new Map<number, number>()
    const soldMap = new Map<number, number>()
    if (rows.length > 0) {
      const ids = rows.map((c) => c.id)
      // pipeline 合并 stock + sold 读取，一次 Redis 往返
      const piped = redis.pipeline()
      ids.forEach((id) => {
        piped.get(`stock:${id}`)
        piped.get(`sold:${id}`)
      })
      const results = (await piped.exec()) ?? []
      ids.forEach((id, i) => {
        const stock = results[i * 2]
        const sold = results[i * 2 + 1]
        if (stock?.[1] !== null && stock?.[1] !== undefined) stockMap.set(id, Number(stock[1]))
        if (sold?.[1] !== null && sold?.[1] !== undefined) soldMap.set(id, Number(sold[1]))
      })
    }

    return rows.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      stock: stockMap.get(course.id) ?? course.stock,
      sold: soldMap.get(course.id) ?? 0,
      category: course.category ?? '',
      cover: course.cover ?? '',
      unlocked: false // 缓存公共部分不含用户态，下方按用户填充
    }))
  })

  // unlocked 是用户相关状态，不能进公共缓存：登录用户单独查询并覆盖
  if (customerUid !== null && list && list.length > 0) {
    const ids = list.map((c) => c.id)
    const paid = await db.select({ courseId: orders.courseId }).from(orders)
      .where(and(eq(orders.paid, true), eq(orders.userId, customerUid), inArray(orders.courseId, ids)))
    const unlockedIds = new Set(paid.map((row) => row.courseId))
    return list.map((c) => ({ ...c, unlocked: unlockedIds.has(c.id) }))
  }

  return list ?? []
})
