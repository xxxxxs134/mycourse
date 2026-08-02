import { issueToken } from '../../utils/auth'
export default defineEventHandler(async (event) => {
  const { username, password } = await readBody<{ username?: string; password?: string }>(event)
  const ok = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS
  if (!ok) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }
  const token = await issueToken('admin', username!)
  return { token }
})