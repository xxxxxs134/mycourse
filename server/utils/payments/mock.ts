import { createHmac, timingSafeEqual } from 'node:crypto'

export const MOCK_SIGN_SECRET = 'mock-wechatpay-secret'

export interface PaymentParams {
  orderId: string
  title: string
  price: number
  baseUrl: string
  channel: string
}

export interface SignResult {
  timestamp: string
  nonce: string
  signature: string
}

export interface CallbackHeaders {
  timestamp?: string
  nonce?: string
  signature?: string
  'x-pay-channel'?: string
  'stripe-signature'?: string
}

export interface PaymentProvider {
  id: string
  label: string
  currency: string
  createPayment(params: PaymentParams): Promise<{ codeUrl: string, real: boolean }>
  signCallback(rawBody: string): SignResult
  verifyCallback(headers: CallbackHeaders, rawBody: string): boolean
  parseOrderId(rawBody: string): string
}

function buildMessage(timestamp: string, nonce: string, rawBody: string): string {
  return `${timestamp}\n${nonce}\n${rawBody}\n`
}

export const mockProvider: PaymentProvider = {
  id: 'mock',
  label: '模拟支付',
  currency: 'CNY',

  createPayment({ orderId, title, price, baseUrl, channel }) {
    const amountFen = Math.round(price * 100)
    const codeUrl = `${baseUrl}/mock-pay?channel=${channel}&orderId=${orderId}&title=${encodeURIComponent(title)}&amount=${amountFen}`
    return Promise.resolve({ codeUrl, real: false })
  },

  signCallback(rawBody) {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = Math.random().toString(36).slice(2)
    const signature = createHmac('sha256', MOCK_SIGN_SECRET)
      .update(buildMessage(timestamp, nonce, rawBody))
      .digest('hex')
    return { timestamp, nonce, signature }
  },

  verifyCallback(headers, rawBody) {
    const { timestamp = '', nonce = '', signature = '' } = headers
    if (!timestamp || !nonce || !signature) return false
    const digest = createHmac('sha256', MOCK_SIGN_SECRET)
      .update(buildMessage(timestamp, nonce, rawBody))
      .digest('hex')
    const expected = Buffer.from(signature, 'hex')
    const actual = Buffer.from(digest, 'hex')
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  },

  parseOrderId(rawBody) {
    const parsed = JSON.parse(rawBody)
    return parsed.out_trade_no
  },
}
