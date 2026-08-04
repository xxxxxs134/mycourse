import { mockProvider, type CallbackHeaders, type PaymentParams, type CallbackData } from './mock'
import { wechatProvider } from './wechat'
import { stripeProvider } from './stripe'

const providers = {
  mock: mockProvider,
  wechat: wechatProvider,
  stripe: stripeProvider,
} as const

export type PayChannel = keyof typeof providers

export function getProvider(channel: string) {
  return providers[channel as PayChannel] ?? mockProvider
}

/** 严格取 provider：未知渠道直接抛错，不回退 mock（防伪造 channel 绕过） */
export function getProviderStrict(channel: string) {
  const p = providers[channel as PayChannel]
  if (!p) throw new Error(`不支持的支付渠道: ${channel}`)
  return p
}

export function listChannels() {
  return Object.values(providers).map((p) => ({
    id: p.id,
    label: p.label,
    currency: p.currency,
  }))
}

export function detectChannel(headers: CallbackHeaders): string {
  if (headers['x-pay-channel']) return headers['x-pay-channel']
  if (headers['stripe-signature']) return 'stripe'
  return 'wechat'
}
export function createPayment(channel: string, params: PaymentParams) {
  return getProvider(channel).createPayment(params)
}

export function verifyCallback(headers: CallbackHeaders, rawBody: string): string {
  const channel = detectChannel(headers)
  const provider = getProviderStrict(channel)
  const ok = provider.verifyCallback(headers, rawBody)
  if (!ok) throw new Error(`签名验证失败 (${channel})`)
  return channel
}

export function parseOrderId(headers: CallbackHeaders, rawBody: string): string {
  const channel = detectChannel(headers)
  return getProviderStrict(channel).parseOrderId(rawBody)
}

export function parseCallbackAmount(headers: CallbackHeaders, rawBody: string): number {
  const channel = detectChannel(headers)
  return getProviderStrict(channel).parseAmount(rawBody)
}

export function parseCallbackData(headers: CallbackHeaders, rawBody: string): CallbackData {
  const channel = detectChannel(headers)
  return getProviderStrict(channel).parseCallback(rawBody)
}
