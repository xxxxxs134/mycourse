import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  scan: vi.fn(),
  eval: vi.fn(),
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
    eval: mocks.eval,
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
  it('权威可用小于当前值时通过 Lua 写入（只减不增）', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [{ courseId: 1, count: 3 }])
    mocks.listPendingCourseIds.mockResolvedValue([1])
    mocks.zcard.mockResolvedValue(2)
    stubScanOnce([])
    stubScanOnce([])
    mocks.eval.mockResolvedValue(1)

    const fixed = await reconcileStock()

    expect(fixed).toBe(1)
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:1', '95')
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('权威可用大于等于当前值时不写入（不覆盖并发扣减）', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([])
    stubScanOnce([])
    stubScanOnce([])
    mocks.eval.mockResolvedValue(0)

    const fixed = await reconcileStock()

    expect(fixed).toBe(0)
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:1', '100')
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('多个课程分别走 Lua 对账', async () => {
    stubSelectFor([{ id: 1, stock: 100 }, { id: 2, stock: 50 }], [{ courseId: 1, count: 1 }])
    mocks.listPendingCourseIds.mockResolvedValue([1, 2])
    mocks.zcard.mockResolvedValue(0)
    stubScanOnce([])
    stubScanOnce([])
    mocks.eval.mockResolvedValue(1)

    const fixed = await reconcileStock()

    expect(fixed).toBe(2)
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:1', '99')
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:2', '50')
  })

  it('孤儿 stock key 与 pending key 被清理', async () => {
    stubSelectFor([{ id: 1, stock: 5 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([1])
    mocks.zcard.mockResolvedValue(0)
    stubScanOnce(['stock:1', 'stock:99'])
    stubScanOnce(['pending:1', 'pending:abc'])
    mocks.eval.mockResolvedValue(1)

    const fixed = await reconcileStock()

    expect(mocks.del).toHaveBeenCalledWith('stock:99')
    expect(mocks.del).toHaveBeenCalledWith('pending:abc')
    expect(mocks.del).not.toHaveBeenCalledWith('pending:1')
    expect(fixed).toBe(3)
  })
})
