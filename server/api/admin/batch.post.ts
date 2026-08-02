import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq, inArray } from '../../db'
import { BatchActionSchema, validate } from '../../utils/validate'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = validate(BatchActionSchema, await readBody(event))

  const { ids, action } = body
  const target = await db.select({ id: courses.id }).from(courses)
    .where(inArray(courses.id, ids))
  if (target.length !== ids.length) {
    throw createError({ statusCode: 404, message: '部分课程不存在' })
  }

  if (action === 'delete') {
    const hasOrders = await db.select({ id: orders.id }).from(orders)
      .where(inArray(orders.courseId, ids))
      .limit(1)
    if (hasOrders.length > 0) {
      throw createError({ statusCode: 409, message: '存在关联订单，只能下架不能删除' })
    }
    await db.delete(courses).where(inArray(courses.id, ids))
  } else {
    await db.update(courses)
      .set({ onSale: action === 'onSale' })
      .where(inArray(courses.id, ids))
  }

  await redis.del('courses:list', ...ids.map((id) => `course:${id}`))
  return { affected: ids.length, action }
})
