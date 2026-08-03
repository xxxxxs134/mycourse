import { SignJWT, jwtVerify } from 'jose'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 未配置：生产环境必须设置 JWT_SECRET')
}

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me'
)

export async function issueToken(role: string, username: string) {
  return new SignJWT({ role, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret)
  return payload
}

export async function requireAdmin(event: any) {
  const header = getHeader(event, 'authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    throw createError({ statusCode: 401, message: '未登录' })
  }
  try {
    const payload = await verifyToken(token)
    if (payload.role !== 'admin') {
      throw createError({ statusCode: 403, message: '无权限' })
    }
  } catch {
    throw createError({ statusCode: 401, message: '登录已过期' })
  }
}