import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createCipheriv, createSign, generateKeyPairSync } from 'node:crypto'

const API_V3_KEY = '0123456789abcdef0123456789abcdef'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })

process.env.WECHAT_APP_ID = 'wx-test'
process.env.WECHAT_MCH_ID = '1234567890'
process.env.WECHAT_API_V3_KEY = API_V3_KEY
process.env.WECHAT_MCH_PRIVATE_KEY = privateKeyPem
process.env.WECHAT_MCH_SERIAL_NO = 'SERIAL-1'
process.env.WECHAT_PLATFORM_PUBLIC_KEY = publicKeyPem

let wechatProvider: typeof import('../server/utils/payments/wechat').wechatProvider
let mockProvider: typeof import('../server/utils/payments/mock').mockProvider

beforeAll(async () => {
  const wechatMod = await import('../server/utils/payments/wechat')
  const mockMod = await import('../server/utils/payments/mock')
  wechatProvider = wechatMod.wechatProvider
  mockProvider = mockMod.mockProvider
})

describe('createPayment', () => {
  it('未配置时回退到 mock 且 channel 标记为 wechat', async () => {
    const saved = process.env.WECHAT_APP_ID
    process.env.WECHAT_APP_ID = ''
    try {
      const result = await wechatProvider.createPayment({
        orderId: 'o-1',
        title: '测试课',
        price: 99,
        baseUrl: 'http://localhost:3000',
        channel: 'wechat',
      })
      expect(result.real).toBe(false)
      expect(result.codeUrl).toContain('/mock-pay')
      expect(result.codeUrl).toContain('channel=wechat')
    } finally {
      process.env.WECHAT_APP_ID = saved
    }
  })
})

describe('verifyCallback', () => {
  it('mock 显式开启且未配置微信密钥时允许 mock 验签（本地联调）', () => {
    const saved = { ...process.env }
    delete process.env.WECHAT_APP_ID
    delete process.env.WECHAT_MCH_ID
    delete process.env.WECHAT_API_V3_KEY
    delete process.env.WECHAT_MCH_PRIVATE_KEY
    delete process.env.WECHAT_MCH_SERIAL_NO
    delete process.env.WECHAT_PLATFORM_PUBLIC_KEY
    process.env.ENABLE_MOCK_WEBHOOK = '1'
    try {
      const rawBody = JSON.stringify({ out_trade_no: 'o-1' })
      const sig = mockProvider.signCallback(rawBody)
      const ok = wechatProvider.verifyCallback({ ...sig, 'x-pay-channel': 'wechat' }, rawBody)
      expect(ok).toBe(true)
    } finally {
      Object.assign(process.env, saved)
    }
  })

  it('生产环境即使未配置也禁止 mock 回退（fail-closed）', () => {
    const saved = { ...process.env }
    process.env.NODE_ENV = 'production'
    delete process.env.WECHAT_APP_ID
    delete process.env.WECHAT_MCH_ID
    delete process.env.WECHAT_API_V3_KEY
    delete process.env.WECHAT_MCH_PRIVATE_KEY
    delete process.env.WECHAT_MCH_SERIAL_NO
    delete process.env.WECHAT_PLATFORM_PUBLIC_KEY
    try {
      const rawBody = JSON.stringify({ out_trade_no: 'o-1' })
      const sig = mockProvider.signCallback(rawBody)
      const ok = wechatProvider.verifyCallback({ ...sig, 'x-pay-channel': 'wechat' }, rawBody)
      expect(ok).toBe(false)
    } finally {
      Object.assign(process.env, saved)
    }
  })

  it('真实微信头且平台公钥匹配时验签通过', () => {
    const { privateKey: pk, publicKey: pub } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.WECHAT_PLATFORM_PUBLIC_KEY = pub.export({ type: 'spki', format: 'pem' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = 'abc123'
    const rawBody = '{"out_trade_no":"o-1"}'
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`
    const signer = createSign('RSA-SHA256')
    signer.update(message)
    signer.end()
    const signature = signer.sign(pk.export({ type: 'pkcs8', format: 'pem' }), 'base64')
    const ok = wechatProvider.verifyCallback({ timestamp, nonce, signature }, rawBody)
    expect(ok).toBe(true)
  })

  it('时间戳过旧（超过 5 分钟）则拒绝（防重放）', () => {
    const { privateKey: pk, publicKey: pub } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.WECHAT_PLATFORM_PUBLIC_KEY = pub.export({ type: 'spki', format: 'pem' })
    const timestamp = String(Math.floor(Date.now() / 1000) - 600)
    const nonce = 'abc123'
    const rawBody = '{"out_trade_no":"o-1"}'
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`
    const signer = createSign('RSA-SHA256')
    signer.update(message)
    signer.end()
    const signature = signer.sign(pk.export({ type: 'pkcs8', format: 'pem' }), 'base64')
    const ok = wechatProvider.verifyCallback({ timestamp, nonce, signature }, rawBody)
    expect(ok).toBe(false)
  })

  it('缺少签名头直接失败', () => {
    expect(wechatProvider.verifyCallback({}, '{}')).toBe(false)
  })
})

describe('parseOrderId', () => {
  it('普通 JSON 直接解析 out_trade_no', () => {
    expect(wechatProvider.parseOrderId('{"out_trade_no":"o-plain"}')).toBe('o-plain')
  })

  it('resource.ciphertext 走 AES-256-GCM 解密', () => {
    const nonce = Buffer.from('0123456789ab', 'utf8')
    const associatedData = 'transaction'
    const plain = JSON.stringify({ out_trade_no: 'o-secret' })
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(API_V3_KEY, 'utf8'), nonce)
    cipher.setAAD(Buffer.from(associatedData))
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64')

    const body = JSON.stringify({
      resource: {
        ciphertext,
        nonce: nonce.toString('utf8'),
        associated_data: associatedData,
      },
    })
    expect(wechatProvider.parseOrderId(body)).toBe('o-secret')
  })
})

describe('parseAmount', () => {
  it('普通 JSON 直接解析 amount（分）', () => {
    expect(wechatProvider.parseAmount('{"out_trade_no":"o","amount":9900}')).toBe(9900)
  })

  it('resource.ciphertext 解密后取 amount.total（分）', () => {
    const nonce = Buffer.from('0123456789ab', 'utf8')
    const associatedData = 'transaction'
    const plain = JSON.stringify({ out_trade_no: 'o-secret', amount: { total: 12345 } })
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(API_V3_KEY, 'utf8'), nonce)
    cipher.setAAD(Buffer.from(associatedData))
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64')

    const body = JSON.stringify({
      resource: {
        ciphertext,
        nonce: nonce.toString('utf8'),
        associated_data: associatedData,
      },
    })
    expect(wechatProvider.parseAmount(body)).toBe(12345)
  })

  it('缺失 amount 返回 0', () => {
    expect(wechatProvider.parseAmount('{"out_trade_no":"o"}')).toBe(0)
  })
})

describe('parseCallback', () => {
  it('普通 JSON 一次解析 orderId / transactionId / amount', () => {
    const cb = wechatProvider.parseCallback('{"out_trade_no":"o-1","transaction_id":"txn-1","amount":9900}')
    expect(cb.orderId).toBe('o-1')
    expect(cb.transactionId).toBe('txn-1')
    expect(cb.amount).toBe(9900)
  })

  it('resource.ciphertext 解密后取 orderId / transaction_id / amount.total', () => {
    const nonce = Buffer.from('0123456789ab', 'utf8')
    const associatedData = 'transaction'
    const plain = JSON.stringify({
      out_trade_no: 'o-secret',
      transaction_id: 'wx-txn-999',
      amount: { total: 12345 },
    })
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(API_V3_KEY, 'utf8'), nonce)
    cipher.setAAD(Buffer.from(associatedData))
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64')

    const body = JSON.stringify({
      resource: {
        ciphertext,
        nonce: nonce.toString('utf8'),
        associated_data: associatedData,
      },
    })
    const cb = wechatProvider.parseCallback(body)
    expect(cb.orderId).toBe('o-secret')
    expect(cb.transactionId).toBe('wx-txn-999')
    expect(cb.amount).toBe(12345)
  })

  it('解密负载缺 transaction_id 时返回 null', () => {
    expect(wechatProvider.parseCallback('{"out_trade_no":"o"}').transactionId).toBeNull()
  })
})

describe('payment provider 结构', () => {
  it('wechat 与 mock 共享回退逻辑但渠道不同', () => {
    expect(wechatProvider.id).toBe('wechat')
    expect(wechatProvider.currency).toBe('CNY')
    expect(wechatProvider.label).toBeTruthy()
  })
})
