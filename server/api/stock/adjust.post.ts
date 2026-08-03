import { sql, and } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../../db'
import { StockAdjustSchema, validate } from '../../utils/validate'
import { requireAdmin } from '../../utils/auth'
import { recordMovement } from '../../utils/stockMovement'
import { invalidateCourseList } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = validate(StockAdjustSchema, await readBody(event))

  const course = (await db.select({ id: courses.id, title: courses.title }).from(courses)
    .where(eq(courses.id, body.courseId)).limit(1))[0]
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

  const current = Number(await redis.get(`stock:${body.courseId}`)) || 0
  let next: number
  let quantity: number

  if (body.type === 'adjust') {
    // 调整 = 直接把库存设置为目标值
    quantity = body.quantity - current
    next = body.quantity
  } else {
    quantity = body.type === 'in' ? body.quantity : -body.quantity
    next = current + quantity
    if (next < 0) {
      throw createError({ statusCode: 400, message: '出库数量超过当前库存' })
    }
  }

  await redis.set(`stock:${body.courseId}`, String(next))

  // DB 基数保持「可用 + 已售 + 待支付」一致性
  const [sold] = await db.select({ cnt: sql<number>`count(*)` }).from(orders)
    .where(and(eq(orders.courseId, body.courseId), eq(orders.paid, true)))
  const pending = await redis.zcard(`pending:${body.courseId}`)
  await db.update(courses)
    .set({ stock: next + Number(sold?.cnt ?? 0) + pending })
    .where(eq(courses.id, body.courseId))

  await invalidateCourseList()
  await redis.del(`course:${body.courseId}`, `course:${body.courseId}:meta`)

  await recordMovement({
    courseId: body.courseId,
    type: body.type,
    quantity,
    beforeQty: current,
    remark: body.remark || (body.type === 'in' ? '入库' : body.type === 'out' ? '出库' : '库存调整')
  })

  return { courseId: body.courseId, before: current, after: next, type: body.type, quantity }
})
