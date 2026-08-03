import { getProvider } from '../utils/payments'
import { MockSignSchema, validate } from '../utils/validate'
import { isMockEnabled } from '../utils/payments/mock'

export default defineEventHandler(async (event) => {
  if (!isMockEnabled()) {
    throw createError({ statusCode: 404, message: '接口不存在' })
  }
  const body = validate(MockSignSchema, await readBody<unknown>(event))
  const provider = getProvider(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
