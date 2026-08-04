import { SignJWT, jwtVerify } from 'jose'

const isProd = (): boolean => (process.env as Record<string, string | undefined>)['NODE_ENV'] === 'production'

if (isProd() && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 未配置：生产环境必须设置 JWT_SECRET')
}
if (isProd()) {
  const s = process.env.JWT_SECRET || ''
  if (s.length < 32 || s === 'dev-secret-change-me' || s === 'please_generate_a_random_secret') {
    throw new Error('JWT_SECRET 强度不足：生产环境必须使用至少 32 字符的随机串')
  }
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
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
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

/**
 * 提取客户端 IP 用于限流。
 * 依序尝试：h3 getRequestIP → X-Forwarded-For → connection.remoteAddress。
 * 全取不到时返回 'local' 单桶（限流仍生效，但共享桶），避免因取不到 IP 阻断合法请求。
 */
export function getClientIp(event: any): string {
  const fromHeaders = getRequestIP(event)
  if (fromHeaders) return fromHeaders
  const xff = getHeader(event, 'x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const conn = event?.node?.req?.connection?.remoteAddress
  if (conn) return conn
  return 'local'
}