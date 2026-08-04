import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  scan: vi.fn(),
  eval: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  zcard: vi.fn(),
  zrange: vi.fn(),
  zrem: vi.fn(),
  listPendingCourseIds: vi.fn(),
  countAllPending: vi.fn(),
  courses: { id: {}, stock: {}, onSale: {} },
  orders: { courseId: {}, paid: {}, orderId: {} },
}))

vi.mock('drizzle-orm', () => ({
  sql: (parts: string[]) => ({ raw: parts.join('?') }),
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
}))

vi.mock('../server/db', () => ({
  courses: mocks.courses,
  orders: mocks.orders,
  db: { select: mocks.select },
  redis: {
    scan: mocks.scan,
    eval: mocks.eval,
    get: mocks.get,
    set: mocks.set,
    del: mocks.del,
    zcard: mocks.zcard,
    zrange: mocks.zrange,
    zrem: mocks.zrem,
  },
  eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
}))

vi.mock('../server/utils/stock', () => ({
  listPendingCourseIds: mocks.listPendingCourseIds,
  countAllPending: mocks.countAllPending,
  SOLD_PREFIX: 'sold:',
  setSold: mocks.set,
}))

let reconcileStock: typeof import('../server/utils/reconcile').reconcileStock

beforeAll(async () => {
  const mod = await import('../server/utils/reconcile')
  reconcileStock = mod.reconcileStock
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue('0')
  mocks.zrange.mockResolvedValue([])
  mocks.zrem.mockResolvedValue(0)
  mocks.listPendingCourseIds.mockResolvedValue([])
})

/** mock select：按 from 表分发（courses 直接返回；orders 按调用计数：1=paidCount(where+groupBy)，2+=cleanup(where)） */
function stubSelectFor(courses: { id: number; stock: number }[], paid: { courseId: number; count: number }[], paidOrderIds: string[] = []) {
  let ordersCall = 0
  mocks.select.mockReturnValue({
    from: (table: any) => {
      if (table === mocks.courses) return courses
      ordersCall++
      const isPaidCount = ordersCall === 1
      return {
        where: (cond: any) => {
          if (isPaidCount) {
            return { groupBy: async () => paid }
          }
          return paidOrderIds.map((id) => ({ orderId: id }))
        },
      }
    },
  })
  const paidMap = new Map(paid.map((p) => [p.courseId, p.count]))
  mocks.get.mockImplementation(async (key: string) => {
    const m = key.match(/^sold:(\d+)$/)
    if (m) return String(paidMap.get(Number(m[1])) ?? 0)
    return String(0) // stock key 当前值
  })
}

function stubScanOnce(keys: string[]) {
  mocks.scan.mockResolvedValueOnce(['0', keys])
}

function stubThreeScans() {
  stubScanOnce([]) // stock:*
  stubScanOnce([]) // sold:*
  stubScanOnce([]) // pending:*
}

describe('reconcileStock', () => {
  it('权威可用小于当前值时 CAS 写入（拉低偏高库存）', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [{ courseId: 1, count: 3 }])
    mocks.listPendingCourseIds.mockResolvedValue([1]) // cleanup 无 pending
    mocks.get.mockImplementation(async (key: string) => {
      if (key.startsWith('stock:')) return '100' // 当前库存 100，权威 97
      if (key.startsWith('sold:')) return '3'
      return '0'
    })
    mocks.eval.mockResolvedValue(1)
    stubThreeScans()

    const fixed = await reconcileStock()

    expect(fixed).toBeGreaterThanOrEqual(1)
    // CAS：expected=当前值 100，avail=97
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:1', '100', '97')
  })

  it('当前值与权威一致时不写（CAS 不变更）', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [{ courseId: 1, count: 3 }])
    mocks.listPendingCourseIds.mockResolvedValue([])
    mocks.get.mockImplementation(async (key: string) => {
      if (key.startsWith('stock:')) return '97' // 当前=权威 97
      if (key.startsWith('sold:')) return '3'
      return '0'
    })
    mocks.eval.mockResolvedValue(-1) // cur==avail 无需修正
    stubThreeScans()

    const fixed = await reconcileStock()

    expect(fixed).toBe(0)
    // cur === avail → 不调 CAS eval
    expect(mocks.eval).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled() // sold 已一致
  })

  it('多个课程分别走 CAS 对账', async () => {
    stubSelectFor([{ id: 1, stock: 100 }, { id: 2, stock: 50 }], [{ courseId: 1, count: 1 }])
    mocks.listPendingCourseIds.mockResolvedValue([])
    mocks.get.mockImplementation(async (key: string) => {
      if (key.startsWith('stock:1')) return '100' // 当前 100，权威 99 → 拉低
      if (key.startsWith('stock:2')) return '49'  // 当前 49，权威 50 → 拉高
      if (key.startsWith('sold:1')) return '1'
      return '0'
    })
    mocks.eval.mockResolvedValue(1)
    stubThreeScans()

    const fixed = await reconcileStock()

    expect(fixed).toBeGreaterThanOrEqual(2)
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:1', '100', '99')
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), 1, 'stock:2', '49', '50')
  })

  it('已支付订单的 pending 残留被清理（R5/R6）', async () => {
    stubSelectFor([{ id: 1, stock: 100 }], [{ courseId: 1, count: 1 }], ['paid-order-1'])
    // cleanupPaidPending：listPendingCourseIds 返回 [1]，zrange 返回残留 pending
    mocks.listPendingCourseIds.mockResolvedValue([1])
    mocks.zrange.mockResolvedValue(['paid-order-1', 'still-pending'])
    mocks.zrem.mockResolvedValue(1)
    mocks.get.mockImplementation(async (key: string) => {
      if (key.startsWith('stock:')) return '98'
      if (key.startsWith('sold:')) return '1'
      return '0'
    })
    mocks.eval.mockResolvedValue(1)
    stubThreeScans()

    const fixed = await reconcileStock()

    // 残留的已支付订单从 pending 移除
    expect(mocks.zrem).toHaveBeenCalledWith('pending:1', 'paid-order-1')
    expect(fixed).toBeGreaterThanOrEqual(1)
  })

  it('孤儿 stock key 与 pending key 被清理', async () => {
    stubSelectFor([{ id: 1, stock: 5 }], [])
    mocks.listPendingCourseIds.mockResolvedValue([])
    mocks.get.mockImplementation(async (key: string) => {
      if (key.startsWith('stock:')) return '5' // cur=avail=5 不 eval
      return '0'
    })
    stubScanOnce(['stock:1', 'stock:99'])
    stubScanOnce([]) // sold:* 无孤儿
    stubScanOnce(['pending:1', 'pending:abc'])

    const fixed = await reconcileStock()

    expect(mocks.del).toHaveBeenCalledWith('stock:99')
    expect(mocks.del).toHaveBeenCalledWith('pending:abc')
    expect(mocks.del).not.toHaveBeenCalledWith('pending:1')
    expect(fixed).toBe(2)
  })
})
