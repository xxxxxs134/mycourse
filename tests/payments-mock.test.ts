import { describe, it, expect } from 'vitest'
import { mockProvider, MOCK_SIGN_SECRET } from '../server/utils/payments/mock'
import { createHmac } from 'node:crypto'

const rawBody = JSON.stringify({
  out_trade_no: 'e7e91b20-4424-427e-9340-3f4a4f56e252',
  transaction_id: 'mock_txn_123',
  amount: 9900,
})

describe('mockProvider.signCallback / verifyCallback', () => {
  it('签名后能通过验签', () => {
    const { timestamp, nonce, signature } = mockProvider.signCallback(rawBody)
    const ok = mockProvider.verifyCallback({ timestamp, nonce, signature }, rawBody)
    expect(ok).toBe(true)
  })

  it('body 被篡改则验签失败', () => {
    const { timestamp, nonce, signature } = mockProvider.signCallback(rawBody)
    const tampered = rawBody.replace('9900', '1')
    const ok = mockProvider.verifyCallback({ timestamp, nonce, signature }, tampered)
    expect(ok).toBe(false)
  })

  it('签名来自不同 secret 则验签失败', () => {
    const { timestamp, nonce } = mockProvider.signCallback(rawBody)
    const badSig = createHmac('sha256', 'wrong-secret')
      .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
      .digest('hex')
    const ok = mockProvider.verifyCallback({ timestamp, nonce, signature: badSig }, rawBody)
    expect(ok).toBe(false)
  })

  it('缺少签名头则直接失败', () => {
    const ok = mockProvider.verifyCallback({}, rawBody)
    expect(ok).toBe(false)
  })

  it('空头字段失败', () => {
    const ok = mockProvider.verifyCallback({ timestamp: '', nonce: '', signature: '' }, rawBody)
    expect(ok).toBe(false)
  })
})

describe('mockProvider.parseOrderId', () => {
  it('解析 out_trade_no', () => {
    expect(mockProvider.parseOrderId(rawBody)).toBe('e7e91b20-4424-427e-9340-3f4a4f56e252')
  })

  it('非法 JSON 抛错', () => {
    expect(() => mockProvider.parseOrderId('not-json')).toThrow()
  })
})

describe('mockProvider.parseAmount', () => {
  it('解析金额（分）', () => {
    expect(mockProvider.parseAmount(rawBody)).toBe(9900)
  })

  it('缺失 amount 时返回 0', () => {
    expect(mockProvider.parseAmount('{"out_trade_no":"x"}')).toBe(0)
  })
})

describe('mockProvider.parseCallback', () => {
  it('一次解析 orderId / transactionId / amount', () => {
    const cb = mockProvider.parseCallback(rawBody)
    expect(cb.orderId).toBe('e7e91b20-4424-427e-9340-3f4a4f56e252')
    expect(cb.transactionId).toBe('mock_txn_123')
    expect(cb.amount).toBe(9900)
  })

  it('缺失 transaction_id 时返回 null', () => {
    const cb = mockProvider.parseCallback('{"out_trade_no":"x","amount":100}')
    expect(cb.transactionId).toBeNull()
    expect(cb.amount).toBe(100)
  })

  it('缺失 out_trade_no 时抛错（防脏 key）', () => {
    expect(() => mockProvider.parseCallback('{"amount":100}')).toThrow()
  })
})

describe('MOCK_SIGN_SECRET', () => {
  it('secret 存在且非空', () => {
    expect(MOCK_SIGN_SECRET.length).toBeGreaterThan(0)
  })
})
