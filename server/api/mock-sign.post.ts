import { getProvider } from '../utils/payments'
import { MockSignSchema, validate } from '../utils/validate'

export default defineEventHandler(async (event) => {
  const body = validate(MockSignSchema, await readBody<unknown>(event))
  const provider = getProvider(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
