import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  exists: vi.fn(),
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
  orders: { paid: {}, createdAt: {}, orderId: {}, courseId: {}, released: {} },
  courses: { id: {}, stock: {} },
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  redis: {
    get: mocks.get,
    set: mocks.set,
    exists: mocks.exists,
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
    released: false,
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

function stubUpdate(affectedRows = 1) {
  mocks.update.mockReturnValue({
    set: () => ({
      where: async () => [{ affectedRows }],
    }),
  })
}

describe('releaseExpiredOrders', () => {
  it('过期未支付订单：抢占 state key 后释放库存并返回数量', async () => {
    stubSelect(expiredOrders('o-1', 'o-2'))
    stubUpdate()
    mocks.get.mockResolvedValue(null)
    mocks.set.mockResolvedValue('OK')
    mocks.exists.mockResolvedValue(0)

    const released = await releaseExpiredOrders()

    expect(released).toBe(2)
    expect(mocks.set).toHaveBeenCalledWith('order:o-1:state', 'RELEASED', 'EX', 86400, 'NX')
    expect(mocks.set).toHaveBeenCalledWith('order:o-2:state', 'RELEASED', 'EX', 86400, 'NX')
    expect(mocks.update).toHaveBeenCalledTimes(4)
    expect(mocks.incr).not.toHaveBeenCalled()
    expect(mocks.del).toHaveBeenCalledWith('courses:list')
  })

  it('redis 中存在 stock key 时同时 incr', async () => {
    stubSelect(expiredOrders('o-stock'))
    stubUpdate()
    mocks.get.mockResolvedValue(null)
    mocks.set.mockResolvedValue('OK')
    mocks.exists.mockImplementation(async (key: string) => (key.startsWith('stock:') ? 1 : 0))

    const released = await releaseExpiredOrders()

    expect(released).toBe(1)
    expect(mocks.incr).toHaveBeenCalledWith('stock:10')
  })

  it('state 已为 PAID 的订单被跳过', async () => {
    stubSelect(expiredOrders('o-paid'))
    mocks.get.mockResolvedValue('PAID')

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('state 已为 RELEASED（崩溃残留）时不再抢 key，但 DB 条件更新生效则释放', async () => {
    stubSelect(expiredOrders('o-crash'))
    stubUpdate()
    mocks.get.mockResolvedValue('RELEASED')
    mocks.exists.mockResolvedValue(0)

    const released = await releaseExpiredOrders()

    expect(released).toBe(1)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  it('DB 条件更新 affectedRows=0（已被并发释放）则跳过', async () => {
    stubSelect(expiredOrders('o-busy'))
    stubUpdate(0)
    mocks.get.mockResolvedValue(null)
    mocks.set.mockResolvedValue('OK')

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.incr).not.toHaveBeenCalled()
  })

  it('没有过期订单时返回 0 且不触碰任何状态', async () => {
    stubSelect([])

    const released = await releaseExpiredOrders()

    expect(released).toBe(0)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.del).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
