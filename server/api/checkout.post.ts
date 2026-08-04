import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq, and } from '../db'
import { createPayment } from '../utils/payments'
import { CheckoutSchema, validate } from '../utils/validate'
import { reserveStock, releasePendingOrder, removeOrder } from '../utils/stock'
import { requireCustomer, getClientIp } from '../utils/auth'
import { jitter } from '../utils/cache'

const COURSE_META_TTL = 300
const COURSE_META_EMPTY = '__EMPTY__'
const COURSE_META_EMPTY_TTL = 10

const RATE_LIMIT_WINDOW_SEC = 1
const RATE_LIMIT_MAX = Number(process.env.CHECKOUT_RATE_LIMIT) || 10

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
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
    .where(and(eq(orders.courseId, id), eq(orders.paid, true)))
  const pending = await redis.zcard(`pending:${id}`)
  const course = (await db.select({ stock: courses.stock }).from(courses).where(eq(courses.id, id)).limit(1))[0]
  const stock = course ? Math.max(course.stock - Number(sold?.count ?? 0) - pending, 0) : 0
  await redis.set(key, String(stock), 'NX')
}

export default defineEventHandler(async (event) => {
  const customer = await requireCustomer(event)
  const body = validate(CheckoutSchema, await readBody<unknown>(event))
  const channel = body.channel ?? 'wechat'

  const ip = getClientIp(event)
  if (!ip) {
    throw createError({ statusCode: 429, message: '无法识别来源，请稍后再试' })
  }

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
    channel,
    userId: customer.uid
  })
  if (remain === -2) {
    await ensureStock(body.id)
    remain = await reserveStock({
      courseId: body.id,
      orderId,
      amount: Math.round(course.price * 100),
      channel,
      userId: customer.uid
    })
  }
  if (remain < 0) {
    throw createError({ statusCode: 410, message: '已售罄' })
  }

  const baseUrl = `${getRequestProtocol(event)}://${getRequestHost(event)}`
  try {
    const { codeUrl, real } = await createPayment(channel, {
      orderId,
      title: course.title,
      price: course.price,
      baseUrl,
      channel
    })
    // 下单成功：失效详情缓存（库存预扣后详情页库存应更新），列表缓存走 10s TTL
    await redis.del(`course:${body.id}`).catch(() => {})
    await redis.incr('metrics:total_orders').catch(() => {})
    return { orderId, codeUrl, channel, real, amount_cent: Math.round(course.price * 100) }
  } catch (err: any) {
    // 创建支付失败：释放已预扣库存，防止 5 分钟僵尸占用
    console.warn(`[checkout] 创建支付失败，释放订单 ${orderId}:`, err?.message || err)
    await releasePendingOrder(body.id, orderId, 60).catch(() => {})
    await removeOrder(orderId).catch(() => {})
    throw err
  }
})
