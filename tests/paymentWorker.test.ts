import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  isStreamSupported: vi.fn(),
  ensureGroup: vi.fn(),
  confirmPayment: vi.fn(),
  xreadgroup: vi.fn(),
  xack: vi.fn(),
  xadd: vi.fn(),
  xautoclaim: vi.fn(),
}))

vi.mock('../server/db', () => ({
  redis: {
    xreadgroup: mocks.xreadgroup,
    xack: mocks.xack,
    xadd: mocks.xadd,
    xautoclaim: mocks.xautoclaim,
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

  it('confirmPayment 返回 ok:false（金额不符）：先 ACK，attempt<3 重入队', async () => {
    mocks.confirmPayment.mockResolvedValue({ ok: false, error: '支付金额与订单金额不符' })
    mocks.xreadgroup.mockResolvedValueOnce([['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000', 'attempt', '1']]]]])
    mocks.xreadgroup.mockResolvedValue([])
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 300))
    stop()

    // 新语义：先 ACK，失败重入队（attempt+1），不重复调用 confirmPayment
    expect(mocks.xack).toHaveBeenCalledWith('pay_queue', 'pay_workers', '1-0')
    expect(mocks.xadd).toHaveBeenCalledWith('pay_queue', '*', 'orderId', 'o-1', 'channel', 'mock', 'amount', '1000', 'attempt', '2')
    expect(mocks.xadd).not.toHaveBeenCalledWith('pay_dead', '*', expect.anything())
  })

  it('confirmPayment 抛异常：attempt 达上限进死信', async () => {
    mocks.confirmPayment.mockRejectedValue(new Error('db down'))
    mocks.xreadgroup.mockResolvedValueOnce([['pay_queue', [['1-0', ['orderId', 'o-1', 'channel', 'mock', 'amount', '1000', 'attempt', '3']]]]])
    mocks.xreadgroup.mockResolvedValue([])
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 300))
    stop()

    // attempt=3 已达上限 → 进死信
    expect(mocks.xadd).toHaveBeenCalledWith('pay_dead', '*', 'orderId', 'o-1', expect.any(String), expect.any(String), 'error', expect.any(String))
  })

  it('XAUTOCLAIM 接管遗留 PEL 消息并处理', async () => {
    mocks.xautoclaim.mockResolvedValueOnce(['0', [['2-0', ['orderId', 'o-2', 'channel', 'mock', 'amount', '2000']]], []])
    mocks.xreadgroup.mockResolvedValue([])
    const stop = startPaymentWorker()
    await new Promise((r) => setTimeout(r, 300))
    stop()

    expect(mocks.xautoclaim).toHaveBeenCalled()
    expect(mocks.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o-2', callbackAmount: 2000 }))
    expect(mocks.xack).toHaveBeenCalledWith('pay_queue', 'pay_workers', '2-0')
  })
})
