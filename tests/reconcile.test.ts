import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  scan: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  zcard: vi.fn(),
  listPendingCourseIds: vi.fn(),
  countAllPending: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  sql: (parts: string[]) => ({ raw: parts.join('?') }),
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
}))

vi.mock('../server/db', () => ({
  courses: { id: {}, stock: {}, onSale: {} },
  orders: { courseId: {}, paid: {} },
  db: { select: mocks.select },
  redis: {
    scan: mocks.scan,
    get: mocks.get,
    set: mocks.set,
    del: mocks.del,
    zcard: mocks.zcard,
  },
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
}))

vi.mock('../server/utils/stock', () => ({
  listPendingCourseIds: mocks.listPendingCourseIds,
  countAllPending: mocks.countAllPending,
}))

let reconcileStock: typeof import('../server/utils/reconcile').reconcileStock

beforeAll(async () => {
  const mod = await import('../server/utils/reconcile')
  reconcileStock = mod.reconcileStock
})

beforeEach(() => {
  vi.clearAllMocks()
})

function stubSelectFor(courses: { id: number; stock: number }[], paid: { courseId: number; count: number }[]) {
  mocks.select
    .mockReturnValueOnce({ from: async () => courses })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          groupBy: async () => paid,
        }),
      }),
    })
}

function stubScanOnce(keys: string[]) {
  mocks.scan.mockResolvedValueOnce(['0', keys])
}

describe('reconcileStock', () => {
  it('无库存 key 时按公式建 key：可用 = 初始 - 已售 - pending', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [{ courseId: 1, count: 3 }])
    mocks.listPendingCourseIds.mockResolvedValue([1])
    mocks.zcard.mockResolvedValue(2)
    stubScanOnce([])
    stubScanOnce([])
    mocks.get.mockResolvedValue(null)

    const fixed = await reconcileStock()

    expect(fixed).toBe(1)
    expect(mocks.set).toHaveBeenCalledWith('stock:1', '95')
  })

  it('Redis 值与公式不一致时重写为正确值', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([])
    stubScanOnce([])
    stubScanOnce([])
    mocks.get.mockResolvedValue('99')

    const fixed = await reconcileStock()

    expect(mocks.set).toHaveBeenCalledWith('stock:1', '100')
    expect(fixed).toBe(1)
  })

  it('Redis 值与公式一致时不动', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([])
    stubScanOnce([])
    stubScanOnce([])
    mocks.get.mockResolvedValue('100')

    const fixed = await reconcileStock()

    expect(mocks.set).not.toHaveBeenCalled()
    expect(fixed).toBe(0)
  })

  it('孤儿 stock key 与 pending key 被清理', async () => {
    stubSelectFor([{ id: 1, stock: 5 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([1])
    mocks.zcard.mockResolvedValue(0)
    stubScanOnce(['stock:1', 'stock:99'])
    stubScanOnce(['pending:1', 'pending:abc'])
    mocks.get.mockResolvedValue('5')

    const fixed = await reconcileStock()

    expect(mocks.del).toHaveBeenCalledWith('stock:99')
    expect(mocks.del).toHaveBeenCalledWith('pending:abc')
    expect(mocks.del).not.toHaveBeenCalledWith('pending:1')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(fixed).toBe(2)
  })
})
