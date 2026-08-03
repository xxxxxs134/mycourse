import { db, users, redis, eq } from '../../db'
import { issueToken } from '../../utils/auth'
import { hashPassword } from '../../utils/password'
import { z } from 'zod'

const RegisterSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, '用户名需为 3-20 位字母/数字/下划线'),
  password: z.string().min(8, '密码至少 8 位').max(64, '密码过长'),
  nickname: z.string().max(50).optional(),
})

const RATE_LIMIT_MAX = Number(process.env.REGISTER_RATE_LIMIT) || 10
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return count
`

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event) ?? 'unknown'
  const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, `ratelimit:register:${ip}`, String(RATE_LIMIT_WINDOW_SEC)))
  if (count > RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, message: '注册过于频繁，请稍后再试' })
  }

  const body = await readBody<unknown>(event)
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message || '参数错误' })
  }
  const { username, password, nickname } = parsed.data

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  if (existing.length > 0) {
    throw createError({ statusCode: 409, message: '用户名已被使用' })
  }

  const passwordHash = await hashPassword(password)
  let result
  try {
    result = await db.insert(users).values({
      username,
      passwordHash,
      nickname: nickname || '',
      createdAt: new Date()
    })
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      throw createError({ statusCode: 409, message: '用户名已被使用' })
    }
    throw err
  }
  const uid = result[0]?.insertId
  if (uid === undefined || uid === null) {
    throw createError({ statusCode: 500, message: '注册失败' })
  }

  const token = await issueToken('customer', username, uid)
  setCookie(event, 'customer_token', token, {
    maxAge: 12 * 3600,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return { token, uid, username }
})
