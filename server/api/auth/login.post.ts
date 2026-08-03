import { issueToken } from '../../utils/auth'
import { redis } from '../../db'

const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT) || 5
const LOGIN_RATE_LIMIT_WINDOW_SEC = 60

const LOGIN_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event) ?? 'unknown'
  const count = Number(await redis.eval(LOGIN_RATE_LIMIT_SCRIPT, 1, `ratelimit:login:${ip}`, String(LOGIN_RATE_LIMIT_WINDOW_SEC)))
  if (count > LOGIN_RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, message: '尝试过于频繁，请稍后再试' })
  }

  const { username, password } = await readBody<{ username?: string; password?: string }>(event)
  const ok = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS
  if (!ok) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }
  const token = await issueToken('admin', username!)
  return { token }
})