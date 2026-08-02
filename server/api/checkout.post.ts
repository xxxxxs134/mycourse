import { randomUUID } from 'node:crypto'
import { db, orders, courses, redis, eq } from '../db'
import { createPayment, listChannels } from '../utils/payments'

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
  const body = await readBody<{ id: number, title: string, price: number, channel?: string }>(event)
  const channel = body.channel ?? 'wechat'

  const stockKey = await ensureStock(body.id)
  const remain = await redis.decr(stockKey)
  if (remain < 0) {
    await redis.incr(stockKey)
    throw createError({ statusCode: 400, statusMessage: '库存不足' })
  }

  const orderId = randomUUID()
  const baseUrl = `${getRequestProtocol(event)}://${getRequestHost(event)}`
  await db.insert(orders).values({
    courseId: body.id,
    orderId,
    createdAt: new Date()
  })
  await db.update(courses).set({ stock: remain }).where(eq(courses.id, body.id))
  const { codeUrl, real } = await createPayment(channel, {
    orderId,
    title: body.title,
    price: body.price,
    baseUrl,
    channel
  })
  return { orderId, codeUrl, channel, real }
})