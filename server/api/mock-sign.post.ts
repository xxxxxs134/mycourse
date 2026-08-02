import { getProvider } from '../utils/payments'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rawBody: string, channel?: string }>(event)
  const provider = getProvider(body.channel || 'wechat')
  return provider.signCallback(body.rawBody)
})
