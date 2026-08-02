import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../../db'
import { CourseUpdateSchema, validate } from '../../utils/validate'
import { requireAdmin } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = validate(CourseUpdateSchema, await readBody(event))

  const patch: Record<string, unknown> = {}
  if (body.stock !== undefined) {
    const [sold] = await db.select({ count: sql<number>`count(*)` }).from(orders)
      .where(eq(orders.courseId, id))
    const pending = await redis.zcard(`pending:${id}`)
    const available = Math.max(body.stock, 0)
    await redis.set(`stock:${id}`, String(available))
    patch.stock = available + Number(sold?.count ?? 0) + pending
  }
  if (body.onSale !== undefined) patch.onSale = body.onSale
  if (body.title !== undefined) patch.title = body.title
  if (body.price !== undefined) patch.price = body.price

  const result = await db.update(courses)
    .set(patch)
    .where(eq(courses.id, id))

  if (result[0].affectedRows === 0) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

  if (body.stock !== undefined) {
    patch.stock = Math.max(body.stock, 0)
  }

  await redis.del('courses:list', `course:${id}`, `course:${id}:meta`)   // 关键！否则列表/详情/下单缓存还是旧数据
  return { id, ...patch }
})