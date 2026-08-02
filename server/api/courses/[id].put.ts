import { db, courses, redis, eq } from '../../db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ stock: number }>(event)

  const result = await db.update(courses)
    .set({ stock: body.stock })
    .where(eq(courses.id, id))

  if (result[0].affectedRows === 0) {
    throw createError({ statusCode: 404, statusMessage: '课程不存在' })
  }

  await redis.del('courses:list')   // 关键！否则列表缓存还是旧库存
  return { id, stock: body.stock }
})