import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  isStreamSupported: vi.fn(),
  ensureGroup: vi.fn(),
  confirmPayment: vi.fn(),
  xreadgroup: vi.fn(),
  xack: vi.fn(),
  xadd: vi.fn(),
}))

vi.mock('../server/db', () => ({
  redis: {
    xreadgroup: mocks.xreadgroup,
    xack: mocks.xack,
    xadd: mocks.xadd,
  },
}))

vi.mock('../server/utils/payQueue', () => ({
  PAY_QUEUE: 'pay_queue',
  PAY_GROUP: 'pay_workers',
  PAY_DEAD: 'pay_dead',
  isStreamSupported: mocks.isStreamSupported,
  ensureGroup: mocks.ensureGroup,
}))

vi.mock('../server/utils/paymentConfirm', () => ({
  confirmPayment: mocks.confirmPayment,
}))

let startPaymentWorker: typeof import('../server/worker/paymentWorker').startPaymentWorker

beforeAll(async () => {
  const mod = await import('../server/worker/paymentWorker')
  startPaymentWorker = mod.startPaymentWorker
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isStreamSupported.mockResolvedValue(true)
  mocks.ensureGroup.mockResolvedValue(undefined)
  mocks.confirmPayment.mockResolvedValue({ ok: true })
  mocks.xreadgroup.mockResolvedValue([['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000']]]]])
  mocks.xack.mockResolvedValue(1)
  mocks.xadd.mockResolvedValue('2-0')
})

describe('paymentWorker', () => {
  it('Stream 不支持：worker 不消费（回退同步）', async () => {
    mocks.isStreamSupported.mockResolvedValue(false)
    const stop = startPaymentWorker()
    // 给异步启动留时间
    await new Promise((r) => setTimeout(r, 100))
    stop()
    expect(mocks.ensureGroup).not.toHaveBeenCalled()
    expect(mocks.xreadgroup).not.toHaveBeenCalled()
  })

  it('消费消息并确认：confirmPayment 成功 → XACK', async () => {
    mocks.xreadgroup
      .mockResolvedValueOnce([['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000']]]]])
      .mockResolvedValueOnce([]) // 第二次轮询无消息，让循环退出
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 300))
    stop()

    expect(mocks.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o-1', channel: 'mock', callbackAmount: 1000 })
    )
    expect(mocks.xack).toHaveBeenCalledWith('pay_queue', 'pay_workers', '1-0')
  })

  it('confirmPayment 返回 ok:false（金额不符）：重试后进死信', async () => {
    mocks.confirmPayment.mockResolvedValue({ ok: false, error: '支付金额与订单金额不符' })
    let first = true
    mocks.xreadgroup.mockImplementation(async () => {
      if (first) {
        first = false
        return [['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000']]]]]
      }
      return []
    })
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 2500)) // 3 次重试 + 退避
    stop()

    // 确认失败重试 3 次后进死信（xadd 参数为展开序列）
    expect(mocks.confirmPayment.mock.calls.filter((c) => c[0].orderId === 'o-1').length).toBeGreaterThanOrEqual(3)
    expect(mocks.xadd).toHaveBeenCalledWith('pay_dead', '*', 'orderId', 'o-1', expect.any(String), expect.any(String), 'error', expect.any(String))
    expect(mocks.xack).toHaveBeenCalled()
  })

  it('confirmPayment 抛异常：重试后进死信', async () => {
    mocks.confirmPayment.mockRejectedValue(new Error('db down'))
    let first = true
    mocks.xreadgroup.mockImplementation(async () => {
      if (first) {
        first = false
        return [['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000']]]]]
      }
      return []
    })
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 2500))
    stop()

    expect(mocks.confirmPayment.mock.calls.filter((c) => c[0].orderId === 'o-1').length).toBeGreaterThanOrEqual(3)
    expect(mocks.xadd).toHaveBeenCalledWith('pay_dead', '*', 'orderId', 'o-1', expect.any(String), expect.any(String), 'error', expect.any(String))
  })
})
