import { SignJWT, jwtVerify } from 'jose'

const isProd = (): boolean => (process.env as Record<string, string | undefined>)['NODE_ENV'] === 'production'

if (isProd() && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 未配置：生产环境必须设置 JWT_SECRET')
}

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me'
)

export async function issueToken(role: string, username: string, uid?: number) {
  return new SignJWT({ role, username, ...(uid !== undefined ? { uid } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret)
  return payload
}

function readToken(event: any, cookieName: string): string | undefined {
  const header = getHeader(event, 'authorization')
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (headerToken) return headerToken
  return getCookie(event, cookieName)
}

export async function requireAdmin(event: any) {
  const token = readToken(event, 'admin_token')
  if (!token) {
    throw createError({ statusCode: 401, message: '未登录' })
  }
  try {
    const payload = await verifyToken(token)
    if (payload.role !== 'admin') {
      throw createError({ statusCode: 403, message: '无权限' })
    }
  } catch (e: any) {
    if (e?.statusCode === 403) throw e
    throw createError({ statusCode: 401, message: '登录已过期' })
  }
}

export async function requireCustomer(event: any) {
  const token = readToken(event, 'customer_token')
  if (!token) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }
  try {
    const payload = await verifyToken(token)
    if (payload.role !== 'customer' || typeof payload.uid !== 'number') {
      throw createError({ statusCode: 403, message: '无权限' })
    }
    return payload as { role: 'customer', uid: number, username: string }
  } catch (e: any) {
    if (e?.statusCode === 403) throw e
    throw createError({ statusCode: 401, message: '登录已过期' })
  }
}

export async function requireAuth(event: any) {
  const token = readToken(event, 'admin_token') ?? readToken(event, 'customer_token')
  if (!token) {
    throw createError({ statusCode: 401, message: '未登录' })
  }
  try {
    return await verifyToken(token)
  } catch {
    throw createError({ statusCode: 401, message: '登录已过期' })
  }
}

export async function readCustomerUid(event: any): Promise<number | null> {
  const token = readToken(event, 'customer_token')
  if (!token) return null
  try {
    const payload = await verifyToken(token)
    if (payload.role === 'customer' && typeof payload.uid === 'number') {
      return payload.uid
    }
  } catch {
    // token 无效/过期 → 视为未登录
  }
  return null
}