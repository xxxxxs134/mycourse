import { getProviderStrict } from '../utils/payments'
import { MockSignSchema, validate } from '../utils/validate'
import { isMockEnabled } from '../utils/payments/mock'

export default defineEventHandler(async (event) => {
  if (!isMockEnabled()) {
    throw createError({ statusCode: 404, message: '接口不存在' })
  }
  // 仅允许本机调用，防止暴露到公网被用来伪造支付签名
  const ip = getRequestIP(event) ?? ''
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    throw createError({ statusCode: 403, message: '禁止访问' })
  }
  const body = validate(MockSignSchema, await readBody<unknown>(event))
  const provider = getProviderStrict(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
