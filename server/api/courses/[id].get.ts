import { db, courses, orders, eq, and, inArray } from '../../db'
import { withCache } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const orderIds = (getHeader(event, 'x-order-ids') || '').split(',').filter(Boolean)

  const course = await withCache(`course:${id}`, 300, async () => {
    return (await db.select().from(courses).where(eq(courses.id, id)).limit(1))[0] ?? null
  })
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

  let unlocked = false
  if (orderIds.length > 0) {
    const paid = (await db.select().from(orders)
      .where(and(
        eq(orders.courseId, id),
        eq(orders.paid, true),
        inArray(orders.orderId, orderIds)
      ))
      .limit(1))[0]
    unlocked = !!paid
  }

  return {
    ...course,
    content: unlocked ? course.content : '',
    unlocked
  }
})
