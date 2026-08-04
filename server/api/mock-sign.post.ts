import { getProviderStrict } from '../utils/payments'
import { MockSignSchema, validate } from '../utils/validate'
import { isMockEnabled } from '../utils/payments/mock'
import { getClientIp } from '../utils/auth'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

export default defineEventHandler(async (event) => {
  if (!isMockEnabled()) {
    throw createError({ statusCode: 404, message: '接口不存在' })
  }
  // 开发环境（本地 dev server）直接放行；其他 mock 环境（staging 等）仅限本机，
  // 防止暴露到公网被用来伪造支付签名
  const nodeEnv = (process.env as Record<string, string | undefined>)['NODE_ENV']
  if (nodeEnv !== 'development') {
    const ip = getClientIp(event)
    if (!LOOPBACK.has(ip)) {
      throw createError({ statusCode: 403, message: '禁止访问' })
    }
  }
  const body = validate(MockSignSchema, await readBody<unknown>(event))
  const provider = getProviderStrict(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
