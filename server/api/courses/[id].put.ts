import { db, courses, redis, eq } from '../../db'
import { CourseUpdateSchema, validate } from '../../utils/validate'
import { requireAdmin } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = validate(CourseUpdateSchema, await readBody(event))

  const patch: Record<string, unknown> = {}
  if (body.stock !== undefined) patch.stock = body.stock
  if (body.onSale !== undefined) patch.onSale = body.onSale
  if (body.title !== undefined) patch.title = body.title
  if (body.price !== undefined) patch.price = body.price

  const result = await db.update(courses)
    .set(patch)
    .where(eq(courses.id, id))

  if (result[0].affectedRows === 0) {
    throw createError({ statusCode: 404, statusMessage: '课程不存在' })
  }

  await redis.del('courses:list', `course:${id}`)   // 关键！否则列表/详情缓存还是旧数据
  return { id, ...patch }
  
})