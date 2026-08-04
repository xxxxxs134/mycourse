import { and, eq } from 'drizzle-orm'
import { db, courses, orders, redis } from '../../db'
import { withCache } from '../../utils/cache'
import { readCustomerUid } from '../../utils/auth'

type CourseDetail = {
  id: number
  title: string
  description: string
  price: number
  stock: number
  sold: number
  onSale: boolean
  category: string
  cover: string
  content: string
  unlocked: boolean
}

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const customerUid = await readCustomerUid(event)

  // 公共部分（课程 + content + stock + sold）入缓存，TTL 10s；unlocked 按用户单独处理
  const course = await withCache<Omit<CourseDetail, 'unlocked'> | null>(`course:${id}`, 10, async () => {
    const row = (await db.select().from(courses).where(eq(courses.id, id)).limit(1))[0] ?? null
    if (!row) return null

    // pipeline 合并 stock + sold 读取，一次 Redis 往返
    const piped = redis.pipeline()
    piped.get(`stock:${id}`)
    piped.get(`sold:${id}`)
    const results = (await piped.exec()) ?? []
    const stock = results[0]?.[1]
    const sold = results[1]?.[1]

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      stock: stock !== null && stock !== undefined ? Number(stock) : row.stock,
      sold: sold !== null && sold !== undefined ? Number(sold) : 0,
      onSale: row.onSale,
      category: row.category ?? '',
      cover: row.cover ?? '',
      content: row.content ?? '',
    }
  })
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

  // unlocked 是用户态，不进公共缓存：登录用户单独查
  let unlocked = false
  if (customerUid !== null) {
    const paid = (await db.select().from(orders)
      .where(and(
        eq(orders.courseId, id),
        eq(orders.paid, true),
        eq(orders.userId, customerUid)
      ))
      .limit(1))[0]
    unlocked = !!paid
  }

  // content 仅解锁用户可见（未解锁返回空，避免泄露付费内容）
  return {
    ...course,
    content: unlocked ? course.content : '',
    unlocked
  }
})
