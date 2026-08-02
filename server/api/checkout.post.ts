import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, orders, courses, redis, eq } from '../db'
import { createPayment } from '../utils/payments'
import { CheckoutSchema, validate } from '../utils/validate'

async function ensureStock(id: number) {
  const key = `stock:${id}`
  const exists = await redis.exists(key)
  if (!exists) {
    const course = (await db.select({ stock: courses.stock }).from(courses).where(eq(courses.id, id)).limit(1))[0]
    const stock = course ? course.stock : 0
    await redis.set(key, String(stock), 'NX')
  }
  return key
}

export default defineEventHandler(async (event) => {
  const body = validate(CheckoutSchema, await readBody<unknown>(event))
  const channel = body.channel ?? 'wechat'

  const course = (await db.select({ title: courses.title, price: courses.price, onSale: courses.onSale })
    .from(courses)
    .where(eq(courses.id, body.id))
    .limit(1))[0]
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }
  if (!course.onSale) {
    throw createError({ statusCode: 400, message: '课程已下架' })
  }

  const stockKey = await ensureStock(body.id)
  const remain = await redis.decr(stockKey)
  if (remain < 0) {
    await redis.incr(stockKey)
    throw createError({ statusCode: 400, message: '库存不足' })
  }

  const orderId = randomUUID()
  const baseUrl = `${getRequestProtocol(event)}://${getRequestHost(event)}`

  const result = await db.execute(sql`
    UPDATE courses SET stock = stock - 1
    WHERE id = ${body.id} AND stock > 0
  `)
  if (Number((result as any)[0]?.affectedRows ?? 0) === 0) {
    await redis.incr(stockKey)
    throw createError({ statusCode: 400, message: '库存不足' })
  }

  await db.insert(orders).values({
    courseId: body.id,
    orderId,
    amount: course.price,
    channel,
    paid: false,
    createdAt: new Date()
  })
  await redis.del(`course:${body.id}`, 'courses:list')

  const { codeUrl, real } = await createPayment(channel, {
    orderId,
    title: course.title,
    price: course.price,
    baseUrl,
    channel
  })
  return { orderId, codeUrl, channel, real }
})