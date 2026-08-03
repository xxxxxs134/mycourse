import {db, courses, redis} from '../db'
import { CourseCreateSchema, validate } from '../utils/validate'
import { requireAdmin } from '../utils/auth'
export default defineEventHandler(async (event)=>{
  await requireAdmin(event)
  const body = validate(CourseCreateSchema, await readBody(event))
  const result=await db.insert(courses).values({
    title: body.title,
    description: body.description,
    price :body.price,
    content: body.content || '',
    createdAt: new Date()
  })
  await redis.del('courses:list')
  const insertId = result[0]?.insertId
  if (insertId === undefined || insertId === null) {
    throw createError({ statusCode: 500, message: '课程创建失败' })
  }
  await redis.set(`stock:${insertId}`, '0')
  return { id: insertId }
})
