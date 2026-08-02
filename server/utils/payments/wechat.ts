import { createSign, createVerify, createDecipheriv, randomBytes } from 'node:crypto'
import { mockProvider, type PaymentProvider, type CallbackHeaders } from './mock'

function env() {
  return {
    appId: process.env.WECHAT_APP_ID || '',
    mchId: process.env.WECHAT_MCH_ID || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    mchPrivateKey: process.env.WECHAT_MCH_PRIVATE_KEY || '',
    mchSerialNo: process.env.WECHAT_MCH_SERIAL_NO || '',
    platformPublicKey: process.env.WECHAT_PLATFORM_PUBLIC_KEY || '',
  }
}

function isConfigured() {
  const c = env()
  return !!(c.appId && c.mchId && c.apiV3Key && c.mchPrivateKey && c.mchSerialNo && c.platformPublicKey)
}

function buildAuthHeader(method: string, urlPath: string, body: string): string {
  const c = env()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomBytes(16).toString('hex')
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`
  const signer = createSign('RSA-SHA256')
  signer.update(message)
  signer.end()
  const signature = signer.sign(c.mchPrivateKey, 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${c.mchSerialNo}"`
}

export const wechatProvider: PaymentProvider = {
  ...mockProvider,
  id: 'wechat',
  label: '微信支付',
  currency: 'CNY',

  async createPayment(params) {
    if (!isConfigured()) {
      return mockProvider.createPayment({ ...params, channel: 'wechat' })
    }
    const c = env()
    const urlPath = '/v3/pay/transactions/native'
    const body = JSON.stringify({
      appid: c.appId,
      mchid: c.mchId,
      description: params.title,
      out_trade_no: params.orderId,
      notify_url: `${params.baseUrl}/api/webhook`,
      amount: { total: Math.round(params.price * 100), currency: 'CNY' },
    })
    const auth = buildAuthHeader('POST', urlPath, body)
    const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(`微信下单失败(${res.status}): ${JSON.stringify(data)}`)
    }
    return { codeUrl: data.code_url, real: true }
  },

  verifyCallback(headers: CallbackHeaders, rawBody: string) {
    if (headers['x-pay-channel']) {
      return mockProvider.verifyCallback(headers, rawBody)
    }
    const c = env()
    const { timestamp = '', nonce = '', signature = '' } = headers
    if (!c.platformPublicKey || !timestamp || !nonce || !signature) return false
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`
    const verifier = createVerify('RSA-SHA256')
    verifier.update(message)
    verifier.end()
    return verifier.verify(c.platformPublicKey, signature, 'base64')
  },

  parseOrderId(rawBody: string) {
    const parsed = JSON.parse(rawBody)
    if (parsed.resource?.ciphertext) {
      const c = env()
      const resource = parsed.resource
      const cipherBuf = Buffer.from(resource.ciphertext, 'base64')
      const authTag = cipherBuf.subarray(cipherBuf.length - 16)
      const data = cipherBuf.subarray(0, cipherBuf.length - 16)
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(c.apiV3Key, 'utf8'), Buffer.from(resource.nonce, 'utf8'))
      decipher.setAuthTag(authTag)
      decipher.setAAD(Buffer.from(resource.associated_data || ''))
      const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
      return JSON.parse(plain).out_trade_no
    }
    return parsed.out_trade_no
  },
}
