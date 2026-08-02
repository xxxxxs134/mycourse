import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  exists: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  del: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  sql: (parts: string[]) => ({ raw: parts.join('?') }),
  lt: (col: unknown, val: unknown) => ({ type: 'lt', col, val }),
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
}))

vi.mock('../server/db', () => ({
  orders: { paid: {}, createdAt: {}, orderId: {}, courseId: {} },
  courses: { id: {}, stock: {} },
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  redis: {
    exists: mocks.exists,
    set: mocks.set,
    incr: mocks.incr,
    del: mocks.del,
  },
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  inArray: (col: unknown, val: unknown[]) => ({ type: 'inArray', col, val }),
}))

let releaseExpiredOrders: typeof import('../server/utils/release').releaseExpiredOrders

beforeAll(async () => {
  process.env.ORDER_TTL_SECONDS = '300'
  const mod = await import('../server/utils/release')
  releaseExpiredOrders = mod.releaseExpiredOrders
})

beforeEach(() => {
  vi.clearAllMocks()
})

function expiredOrders(...orderIds: string[]) {
  return orderIds.map((orderId, i) => ({
    id: i + 1,
    orderId,
    courseId: i + 10,
    paid: false,
    createdAt: new Date(),
  }))
}

function stubSelect(orders: unknown[]) {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => orders,
      }),
    }),
  })
}

function stubUpdate() {
  mocks.update.mockReturnValue({
    set: () => ({
      where: async () => undefined,
    }),
  })
}

describe('releaseExpiredOrders', () => {
  it('过期未支付订单：释放库存并返回数量', async () => {
    stubSelect(expiredOrders('o-1', 'o-2'))
    stubUpdate()
    mocks.exists.mockImplementation(async (key: string) => (key.includes(':paid') ? 0 : 0))
    mocks.set.mockResolvedValue('OK')

    const released = await releaseExpiredOrders()

    expect(released).toBe(2)
    expect(mocks.incr).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.del).toHaveBeenCalledWith('courses:list')
  })

  it('存在已支付标记的订单被跳过', async () => {
    stubSelect(expiredOrders('o-paid'))
    stubUpdate()
    mocks.exists.mockImplementation(async (key: string) => (key.endsWith(':paid') ? 1 : 0))

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('release 标记被并发抢占（NX 返回 null）则跳过', async () => {
    stubSelect(expiredOrders('o-busy'))
    stubUpdate()
    mocks.exists.mockResolvedValue(0)
    mocks.set.mockResolvedValue(null)

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('redis 中存在 stock key 时同时 incr', async () => {
    stubSelect(expiredOrders('o-stock'))
    stubUpdate()
    mocks.exists.mockImplementation(async (key: string) => (key.startsWith('stock:') ? 1 : 0))
    mocks.set.mockResolvedValue('OK')

    const released = await releaseExpiredOrders()

    expect(released).toBe(1)
    expect(mocks.incr).toHaveBeenCalledWith('stock:10')
  })

  it('没有过期订单时返回 0 且不触碰缓存', async () => {
    stubSelect([])

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.del).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
