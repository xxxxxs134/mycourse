import { db, users, redis, eq } from '../../db'
import { issueToken, getClientIp } from '../../utils/auth'
import { verifyPassword } from '../../utils/password'
import { z } from 'zod'

const LoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(64),
})

const RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT) || 10
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return count
`

// 防用户名枚举：用户不存在与密码错误返回相同文案
const FAIL_MESSAGE = '用户名或密码错误'

export default defineEventHandler(async (event) => {
  const ip = getClientIp(event)
  if (!ip) {
    throw createError({ statusCode: 429, message: '无法识别来源，请稍后再试' })
  }
  const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, `ratelimit:customer-login:${ip}`, String(RATE_LIMIT_WINDOW_SEC)))
  if (count > RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, message: '尝试过于频繁，请稍后再试' })
  }

  const body = await readBody<unknown>(event)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: '参数错误' })
  }
  const { username, password } = parsed.data

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  // 用户不存在也走一次 verify 流程，保持响应时间一致（防时序枚举）
  const stored = user?.passwordHash ?? ''
  const ok = await verifyPassword(password, stored)
  if (!user || !ok) {
    throw createError({ statusCode: 401, message: FAIL_MESSAGE })
  }

  const token = await issueToken('customer', user.username, user.id)
  setCookie(event, 'customer_token', token, {
    maxAge: 12 * 3600,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return { token, uid: user.id, username: user.username }
})
