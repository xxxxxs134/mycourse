import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { createPayment } from '../utils/payments'
import { CheckoutSchema, validate } from '../utils/validate'
import { reserveStock } from '../utils/stock'
import { jitter } from '../utils/cache'

const COURSE_META_TTL = 300
const COURSE_META_EMPTY = '__EMPTY__'
const COURSE_META_EMPTY_TTL = 10

const RATE_LIMIT_WINDOW_SEC = 1
const RATE_LIMIT_MAX = Number(process.env.CHECKOUT_RATE_LIMIT) || 10

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

interface CourseMeta {
  title: string
  price: number
  onSale: boolean
}

async function getCourseMeta(id: number): Promise<CourseMeta | null> {
  const cached = await redis.get(`course:${id}:meta`)
  if (cached !== null) {
    return cached === COURSE_META_EMPTY ? null : JSON.parse(cached) as CourseMeta
  }
  const course = (await db.select({ title: courses.title, price: courses.price, onSale: courses.onSale })
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1))[0] ?? null
  if (course) {
    await redis.set(`course:${id}:meta`, JSON.stringify(course), 'EX', jitter(COURSE_META_TTL))
  } else {
    await redis.set(`course:${id}:meta`, COURSE_META_EMPTY, 'EX', COURSE_META_EMPTY_TTL)
  }
  return course
}

async function ensureStock(id: number) {
  const key = `stock:${id}`
  const [sold] = await db.select({ count: sql<number>`count(*)` }).from(orders)
    .where(eq(orders.courseId, id))
  const pending = await redis.zcard(`pending:${id}`)
  const course = (await db.select({ stock: courses.stock }).from(courses).where(eq(courses.id, id)).limit(1))[0]
  const stock = course ? Math.max(course.stock - Number(sold?.count ?? 0) - pending, 0) : 0
  await redis.set(key, String(stock))
}

export default defineEventHandler(async (event) => {
  const body = validate(CheckoutSchema, await readBody<unknown>(event))
  const channel = body.channel ?? 'wechat'

  const ip = getRequestIP(event) ?? 'unknown'

  const piped = redis.pipeline()
  piped.get(`course:${body.id}:meta`)
  if (RATE_LIMIT_MAX > 0) {
    piped.eval(RATE_LIMIT_SCRIPT, 1, `ratelimit:checkout:${ip}`, String(RATE_LIMIT_WINDOW_SEC))
  }
  const results = (await piped.exec()) ?? []

  let course: CourseMeta | null = null
  let idx = 0
  const metaRaw = results[idx++]
  if (metaRaw?.[0]) throw metaRaw[0]
  if (metaRaw?.[1] !== null && metaRaw?.[1] !== undefined) {
    course = metaRaw[1] === COURSE_META_EMPTY ? null : JSON.parse(metaRaw[1] as string) as CourseMeta
  } else {
    course = await getCourseMeta(body.id)
  }
  if (!course) {
    throw createError({ statusCode: 404, message: '课程不存在' })
  }
  if (!course.onSale) {
    throw createError({ statusCode: 400, message: '课程已下架' })
  }

  if (RATE_LIMIT_MAX > 0) {
    const limitResult = results[idx++]
    if (limitResult?.[0]) throw limitResult[0]
    if (limitResult?.[1] !== undefined && Number(limitResult[1]) > RATE_LIMIT_MAX) {
      throw createError({ statusCode: 429, message: '请求过于频繁，请稍后再试' })
    }
  }

  const orderId = randomUUID()

  let remain = await reserveStock({
    courseId: body.id,
    orderId,
    amount: Math.round(course.price * 100),
    channel
  })
  if (remain === -2) {
    await ensureStock(body.id)
    remain = await reserveStock({
      courseId: body.id,
      orderId,
      amount: Math.round(course.price * 100),
      channel
    })
  }
  if (remain < 0) {
    throw createError({ statusCode: 400, message: '库存不足' })
  }

  const baseUrl = `${getRequestProtocol(event)}://${getRequestHost(event)}`
  const { codeUrl, real } = await createPayment(channel, {
    orderId,
    title: course.title,
    price: course.price,
    baseUrl,
    channel
  })
  return { orderId, codeUrl, channel, real }
})
