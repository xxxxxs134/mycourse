import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq, and } from '../../db'
import { CourseUpdateSchema, validate } from '../../utils/validate'
import { requireAdmin } from '../../utils/auth'
import { invalidateCourseList } from '../../utils/cache'
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = validate(CourseUpdateSchema, await readBody(event))

  const patch: Record<string, unknown> = {}
  let responseStock: number | undefined
  if (body.stock !== undefined) {
    // 管理端设置的是「当前可用库存」，直接写入 Redis（权威）。
    // DB courses.stock 记录为基数（可用 + 已售 + 待支付），供 reconcile 做基准。
    // 已知限制：此处读 sold/pending 与并发下单之间是毫秒级竞态，极端并发下
    // 该课程库存可能短暂偏差，由 reconcileStock()（30s 周期）以 DB 权威修正。
    const [sold] = await db.select({ count: sql<number>`count(*)` }).from(orders)
      .where(and(eq(orders.courseId, id), eq(orders.paid, true)))
    const pending = await redis.zcard(`pending:${id}`)
    const available = Math.max(body.stock, 0)
    await redis.set(`stock:${id}`, String(available))
    responseStock = available
    patch.stock = available + Number(sold?.count ?? 0) + pending
  }
  if (body.onSale !== undefined) patch.onSale = body.onSale
  if (body.title !== undefined) patch.title = body.title
  if (body.price !== undefined) patch.price = body.price
  if (body.category !== undefined) patch.category = body.category
  if (body.cover !== undefined) patch.cover = body.cover

  const result = await db.update(courses)
    .set(patch)
    .where(eq(courses.id, id))

  if (result[0].affectedRows === 0) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

  await invalidateCourseList()
  await redis.del(`course:${id}`, `course:${id}:meta`)   // 关键！否则详情/下单缓存还是旧数据
  if (responseStock !== undefined) patch.stock = responseStock
  return { id, ...patch }
})