import { mockProvider, type CallbackHeaders, type PaymentParams } from './mock'
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
  const ok = getProvider(channel).verifyCallback(headers, rawBody)
  if (!ok) throw new Error(`签名验证失败 (${channel})`)
  return channel
}

export function parseOrderId(headers: CallbackHeaders, rawBody: string): string {
  const channel = detectChannel(headers)
  return getProvider(channel).parseOrderId(rawBody)
}

export function parseCallbackAmount(headers: CallbackHeaders, rawBody: string): number {
  const channel = detectChannel(headers)
  return getProvider(channel).parseAmount(rawBody)
}
