import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPendingOrder: vi.fn(),
  removePending: vi.fn(),
  removeOrder: vi.fn(),
  incrSold: vi.fn(),
  recordMovement: vi.fn(),
  invalidateCourseList: vi.fn(),
  transaction: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  pipeline: vi.fn(),
}))

vi.mock('../server/db', () => ({
  redis: {
    del: mocks.del,
    get: mocks.get,
    pipeline: mocks.pipeline,
  },
  db: { transaction: mocks.transaction },
  orders: {},
  orderPayments: {},
}))

vi.mock('../server/utils/stock', () => ({
  getPendingOrder: mocks.getPendingOrder,
  removePending: mocks.removePending,
  removeOrder: mocks.removeOrder,
  incrSold: mocks.incrSold,
}))

vi.mock('../server/utils/stockMovement', () => ({
  recordMovement: mocks.recordMovement,
}))

vi.mock('../server/utils/cache', () => ({
  invalidateCourseList: mocks.invalidateCourseList,
}))

let confirmPayment: typeof import('../server/utils/paymentConfirm').confirmPayment

const pending = {
  orderId: 'o-1',
  courseId: 5,
  amount: 1000,
  channel: 'mock',
  createdAt: Date.now(),
  userId: 3,
}

beforeAll(async () => {
  const mod = await import('../server/utils/paymentConfirm')
  confirmPayment = mod.confirmPayment
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPendingOrder.mockResolvedValue(pending)
  mocks.transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => fn({ insert: () => ({ values: () => ({}) }) }))
  mocks.get.mockResolvedValue('10')
  mocks.pipeline.mockReturnValue({ zadd: () => ({ zremrangebyscore: () => ({ exec: async () => [] }) }), exec: async () => [] })
  mocks.incrSold.mockResolvedValue(1)
})

describe('confirmPayment', () => {
  it('支付确认成功：落库 + 记流水 + INCR sold + 失效缓存', async () => {
    const res = await confirmPayment({ orderId: 'o-1', channel: 'mock', transactionId: 'txn-1', callbackAmount: 1000 })

    expect(res).toEqual({ ok: true, duplicate: false })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.incrSold).toHaveBeenCalledWith(5)
    expect(mocks.recordMovement).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateCourseList).toHaveBeenCalledTimes(1)
    expect(mocks.removePending).toHaveBeenCalledWith(5, 'o-1')
    expect(mocks.removeOrder).toHaveBeenCalledWith('o-1')
  })

  it('订单不存在：返回 ok:false 不落库', async () => {
    mocks.getPendingOrder.mockResolvedValue(null)
    const res = await confirmPayment({ orderId: 'o-x', channel: 'mock', transactionId: null, callbackAmount: 1000 })
    expect(res.ok).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('金额不符：返回 ok:false 不落库', async () => {
    const res = await confirmPayment({ orderId: 'o-1', channel: 'mock', transactionId: null, callbackAmount: 999 })
    expect(res.ok).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('重复落库（ER_DUP_ENTRY）：返回 duplicate 且不重复记流水/INCR', async () => {
    mocks.transaction.mockImplementation(async () => {
      const err: any = new Error('dup')
      err.code = 'ER_DUP_ENTRY'
      throw err
    })
    const res = await confirmPayment({ orderId: 'o-1', channel: 'mock', transactionId: null, callbackAmount: 1000 })

    expect(res).toEqual({ ok: true, duplicate: true })
    expect(mocks.incrSold).not.toHaveBeenCalled()
    expect(mocks.recordMovement).not.toHaveBeenCalled()
    // 幂等：仍清理 pending 与缓存
    expect(mocks.removePending).toHaveBeenCalled()
    expect(mocks.invalidateCourseList).toHaveBeenCalled()
  })

  it('非 DUP 落库错误：抛出异常（交给 worker 重试）', async () => {
    mocks.transaction.mockImplementation(async () => {
      throw new Error('db down')
    })
    await expect(confirmPayment({ orderId: 'o-1', channel: 'mock', transactionId: null, callbackAmount: 1000 }))
      .rejects.toThrow('db down')
  })
})
