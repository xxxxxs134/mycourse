import {db, courses, redis} from '../db'

export default defineEventHandler(async (event)=>{
  const body=await readBody(event)
  const result=await db.insert(courses).values({
    title: body.title,
    description: body.description,
    price :body.price,
    content: body.content || '',
    createdAt: new Date()
  })
  await redis.del('courses:list')
  return {id:result[0].insertId}
})
