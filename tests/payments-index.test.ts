import { describe, it, expect } from 'vitest'
import { getProvider, listChannels, detectChannel, verifyCallback, parseOrderId, parseCallbackData } from '../server/utils/payments'
import { mockProvider } from '../server/utils/payments/mock'

const mockSig = mockProvider.signCallback(JSON.stringify({ out_trade_no: 'oid-1' }))

describe('getProvider', () => {
  it('返回已注册渠道', () => {
    expect(getProvider('mock').id).toBe('mock')
    expect(getProvider('wechat').id).toBe('wechat')
    expect(getProvider('stripe').id).toBe('stripe')
  })

  it('未知渠道回退到 mock', () => {
    expect(getProvider('alipay').id).toBe('mock')
  })
})

describe('listChannels', () => {
  it('返回全部渠道的 id/label/currency', () => {
    const channels = listChannels()
    const ids = channels.map((c) => c.id)
    expect(ids).toContain('mock')
    expect(ids).toContain('wechat')
    expect(ids).toContain('stripe')
    for (const c of channels) {
      expect(c.label).toBeTruthy()
      expect(c.currency).toBeTruthy()
    }
  })
})

describe('detectChannel', () => {
  it('x-pay-channel 优先', () => {
    expect(detectChannel({ 'x-pay-channel': 'mock', 'stripe-signature': 'x' })).toBe('mock')
  })

  it('有 stripe-signature 则判为 stripe', () => {
    expect(detectChannel({ 'stripe-signature': 'sig' })).toBe('stripe')
  })

  it('都没有则默认 wechat', () => {
    expect(detectChannel({})).toBe('wechat')
  })
})

describe('verifyCallback / parseOrderId', () => {
  const rawBody = JSON.stringify({ out_trade_no: 'oid-abc' })
  const sig = mockProvider.signCallback(rawBody)

  it('mock 签名通过并返回 mock', () => {
    const { timestamp, nonce, signature } = sig
    expect(verifyCallback({ 'x-pay-channel': 'mock', timestamp, nonce, signature }, rawBody)).toBe('mock')
  })

  it('签名错误抛异常', () => {
    expect(() => verifyCallback(
      { 'x-pay-channel': 'mock', timestamp: '1', nonce: 'n', signature: 'bad' },
      rawBody,
    )).toThrow()
  })

  it('parseOrderId 按渠道解析', () => {
    const { timestamp, nonce, signature } = sig
    expect(parseOrderId({ 'x-pay-channel': 'mock', timestamp, nonce, signature }, rawBody)).toBe('oid-abc')
  })

  it('parseCallbackData 按渠道一次解析', () => {
    const body = JSON.stringify({ out_trade_no: 'oid-abc', transaction_id: 'txn-1', amount: 9900 })
    const { timestamp, nonce, signature } = mockProvider.signCallback(body)
    const cb = parseCallbackData({ 'x-pay-channel': 'mock', timestamp, nonce, signature }, body)
    expect(cb.orderId).toBe('oid-abc')
    expect(cb.transactionId).toBe('txn-1')
    expect(cb.amount).toBe(9900)
  })
})
