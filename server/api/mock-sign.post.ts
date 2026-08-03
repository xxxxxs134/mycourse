import { getProvider } from '../utils/payments'
import { MockSignSchema, validate } from '../utils/validate'
import { requireAdmin } from '../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = validate(MockSignSchema, await readBody<unknown>(event))
  const provider = getProvider(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
