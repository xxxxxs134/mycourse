import { createHmac, timingSafeEqual } from 'node:crypto'

function resolveMockSecret(): string {
  const envSecret = process.env.MOCK_SIGN_SECRET
  if (envSecret) return envSecret
  if (isProd()) {
    throw new Error('MOCK_SIGN_SECRET 未配置：生产环境必须设置 MOCK_SIGN_SECRET')
  }
  return 'dev-mock-secret'
}

export const MOCK_SIGN_SECRET = resolveMockSecret()

export function isProd(): boolean {
  return (process.env as Record<string, string | undefined>)['NODE_ENV'] === 'production'
}

/**
 * mock 支付仅在显式开启时可用：
 * - NODE_ENV=development（本地联调）
 * - 或显式设置 ENABLE_MOCK_WEBHOOK=1（staging 联调）
 * 生产环境（production）始终禁用，杜绝 mock 签名伪造支付。
 */
export function isMockEnabled(): boolean {
  if (isProd()) return false
  const nodeEnv = (process.env as Record<string, string | undefined>)['NODE_ENV']
  if (nodeEnv === 'development') return true
  return (process.env as Record<string, string | undefined>)['ENABLE_MOCK_WEBHOOK'] === '1'
}

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

export interface CallbackData {
  orderId: string
  transactionId: string | null
  amount: number
}

export interface PaymentProvider {
  id: string
  label: string
  currency: string
  createPayment(params: PaymentParams): Promise<{ codeUrl: string, real: boolean }>
  signCallback(rawBody: string): SignResult
  verifyCallback(headers: CallbackHeaders, rawBody: string): boolean
  parseOrderId(rawBody: string): string
  parseAmount(rawBody: string): number
  parseCallback(rawBody: string): CallbackData
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

  parseAmount(rawBody) {
    const parsed = JSON.parse(rawBody)
    return Number(parsed.amount) || 0
  },

  parseCallback(rawBody) {
    const parsed = JSON.parse(rawBody)
    if (typeof parsed.out_trade_no !== 'string' || !parsed.out_trade_no) {
      throw new Error('回调缺少 out_trade_no')
    }
    return {
      orderId: parsed.out_trade_no,
      transactionId: parsed.transaction_id ?? null,
      amount: Number(parsed.amount) || 0,
    }
  },
}
