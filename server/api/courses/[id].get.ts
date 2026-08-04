import { db, courses, orders, redis, eq, and } from '../../db'
import { withCache } from '../../utils/cache'
import { readCustomerUid } from '../../utils/auth'
import { getSold } from '../../utils/stock'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const customerUid = await readCustomerUid(event)

  const course = await withCache(`course:${id}`, 300, async () => {
    return (await db.select().from(courses).where(eq(courses.id, id)).limit(1))[0] ?? null
  })
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }

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

  const [liveStock, sold] = await Promise.all([
    redis.get(`stock:${id}`),
    getSold(id)
  ])

  return {
    ...course,
    stock: liveStock !== null ? Number(liveStock) : course.stock,
    sold,
    content: unlocked ? course.content : '',
    unlocked
  }
})
