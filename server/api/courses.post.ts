import {db, courses, redis} from '../db'
import { CourseCreateSchema, validate } from '../utils/validate'
import { requireAdmin } from '../utils/auth'
import { recordMovement } from '../utils/stockMovement'
import { invalidateCourseList } from '../utils/cache'
import { setSold } from '../utils/stock'
export default defineEventHandler(async (event)=>{
  await requireAdmin(event)
  const body = validate(CourseCreateSchema, await readBody(event))
  const result=await db.insert(courses).values({
    title: body.title,
    description: body.description,
    price :body.price,
    content: body.content || '',
    category: body.category || '',
    cover: body.cover || '',
    createdAt: new Date()
  })
  await invalidateCourseList()
  const insertId = result[0]?.insertId
  if (insertId === undefined || insertId === null) {
    throw createError({ statusCode: 500, message: '课程创建失败' })
  }
  await redis.set(`stock:${insertId}`, '0')
  await setSold(insertId, 0)
  await recordMovement({ courseId: insertId, type: 'create', quantity: 0, beforeQty: 0, remark: '创建课程' })
  return { id: insertId }
})
