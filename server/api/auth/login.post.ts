import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { issueToken, getClientIp } from '../../utils/auth'
import { redis } from '../../db'

const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT) || 5
const LOGIN_RATE_LIMIT_WINDOW_SEC = 60

const LOGIN_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return count
`

const LoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(64),
})

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export default defineEventHandler(async (event) => {
  const ip = getClientIp(event)
  if (!ip) {
    throw createError({ statusCode: 429, message: '无法识别来源，请稍后再试' })
  }
  const count = Number(await redis.eval(LOGIN_RATE_LIMIT_SCRIPT, 1, `ratelimit:login:${ip}`, String(LOGIN_RATE_LIMIT_WINDOW_SEC)))
  if (count > LOGIN_RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, message: '尝试过于频繁，请稍后再试' })
  }

  const body = await readBody<unknown>(event)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: '参数错误' })
  }
  const { username, password } = parsed.data
  const ok = safeEq(username, process.env.ADMIN_USER || '') && safeEq(password, process.env.ADMIN_PASS || '')
  if (!ok) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }
  const token = await issueToken('admin', username)
  setCookie(event, 'admin_token', token, {
    maxAge: 12 * 3600,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return { token }
})