import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPendingCourseIds: vi.fn(),
  listExpiredPending: vi.fn(),
  releasePendingOrder: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  invalidate: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  orders: {},
}))

vi.mock('drizzle-orm', () => ({
  sql: (parts: string[]) => ({ raw: parts.join('?') }),
}))

vi.mock('../server/db', () => ({
  redis: { del: mocks.del, get: mocks.get },
  db: { insert: mocks.insert, select: mocks.select },
  orders: mocks.orders,
  stockMovements: {},
}))

vi.mock('../server/utils/stock', () => ({
  listPendingCourseIds: mocks.listPendingCourseIds,
  listExpiredPending: mocks.listExpiredPending,
  releasePendingOrder: mocks.releasePendingOrder,
}))

vi.mock('../server/utils/cache', () => ({
  invalidateCourseList: mocks.invalidate,
}))

let releaseExpiredOrders: typeof import('../server/utils/release').releaseExpiredOrders

beforeAll(async () => {
  process.env.ORDER_TTL_SECONDS = '300'
  const mod = await import('../server/utils/release')
  releaseExpiredOrders = mod.releaseExpiredOrders
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue('10')
  mocks.insert.mockReturnValue({ values: () => Promise.resolve() })
  // release 预检：paid 订单查询返回空（无已支付订单，全部正常释放）
  mocks.select.mockReturnValue({
    from: () => ({
      where: async () => [],
    }),
  })
})

describe('releaseExpiredOrders', () => {
  it('无 pending 课程时返回 0 且不触碰缓存', async () => {
    mocks.listPendingCourseIds.mockResolvedValue([])

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it('过期订单全部释放成功并失效缓存', async () => {
    mocks.listPendingCourseIds.mockResolvedValue([10, 20])
    mocks.listExpiredPending.mockImplementation(async (courseId: number) => courseId === 10 ? ['o-1', 'o-2'] : ['o-3'])
    mocks.releasePendingOrder.mockResolvedValue(1)

    const released = await releaseExpiredOrders()

    expect(released).toBe(3)
    expect(mocks.releasePendingOrder).toHaveBeenCalledWith(10, 'o-1', 86400)
    expect(mocks.releasePendingOrder).toHaveBeenCalledWith(20, 'o-3', 86400)
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
  })

  it('已支付订单跳过释放（R7：防 state 过期后库存超计）', async () => {
    mocks.listPendingCourseIds.mockResolvedValue([10])
    mocks.listExpiredPending.mockResolvedValue(['paid-order', 'pending-order'])
    mocks.releasePendingOrder.mockResolvedValue(1)
    // paid 预检：paid-order 已支付，pending-order 未支付
    mocks.select.mockReturnValue({
      from: () => ({
        where: async () => [{ orderId: 'paid-order' }],
      }),
    })

    const released = await releaseExpiredOrders()

    // 只释放未支付的 pending-order
    expect(released).toBe(1)
    expect(mocks.releasePendingOrder).toHaveBeenCalledWith(10, 'pending-order', 86400)
    expect(mocks.releasePendingOrder).not.toHaveBeenCalledWith(10, 'paid-order', expect.anything())
  })

  it('releasePendingOrder 返回 0（已被并发释放）不计数', async () => {
    mocks.listPendingCourseIds.mockResolvedValue([10])
    mocks.listExpiredPending.mockResolvedValue(['o-1'])
    mocks.releasePendingOrder.mockResolvedValue(0)

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it('releasePendingOrder 返回 -1（已支付）不计数', async () => {
    mocks.listPendingCourseIds.mockResolvedValue([10])
    mocks.listExpiredPending.mockResolvedValue(['o-paid'])
    mocks.releasePendingOrder.mockResolvedValue(-1)

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.del).not.toHaveBeenCalled()
  })
})
