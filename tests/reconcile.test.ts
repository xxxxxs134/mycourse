import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  keys: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  sql: (parts: string[]) => ({ raw: parts.join('?') }),
}))

vi.mock('../server/db', () => ({
  courses: { id: {}, stock: {} },
  db: {
    select: mocks.select,
  },
  redis: {
    keys: mocks.keys,
    get: mocks.get,
    set: mocks.set,
    del: mocks.del,
  },
}))

let reconcileStock: typeof import('../server/utils/reconcile').reconcileStock

beforeAll(async () => {
  const mod = await import('../server/utils/reconcile')
  reconcileStock = mod.reconcileStock
})

beforeEach(() => {
  vi.clearAllMocks()
})

function stubCourses(rows: { id: number; stock: number }[]) {
  mocks.select.mockReturnValue({
    from: async () => rows,
  })
}

describe('reconcileStock', () => {
  it('无 stock key 时返回 0', async () => {
    stubCourses([{ id: 1, stock: 5 }])
    mocks.keys.mockResolvedValue([])

    const fixed = await reconcileStock()

    expect(fixed).toBe(0)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it('Redis 值与 DB 不一致时重写为 DB 值', async () => {
    stubCourses([{ id: 1, stock: 5 }])
    mocks.keys.mockResolvedValue(['stock:1'])
    mocks.get.mockResolvedValue('2')

    const fixed = await reconcileStock()

    expect(fixed).toBe(1)
    expect(mocks.set).toHaveBeenCalledWith('stock:1', '5')
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it('Redis 值与 DB 一致时不动', async () => {
    stubCourses([{ id: 1, stock: 5 }])
    mocks.keys.mockResolvedValue(['stock:1'])
    mocks.get.mockResolvedValue('5')

    const fixed = await reconcileStock()

    expect(fixed).toBe(1)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('已删除课程的孤儿 stock key 被清理', async () => {
    stubCourses([{ id: 1, stock: 5 }])
    mocks.keys.mockResolvedValue(['stock:1', 'stock:99', 'stock:abc'])

    const fixed = await reconcileStock()

    expect(mocks.del).toHaveBeenCalledWith('stock:99')
    expect(mocks.del).toHaveBeenCalledWith('stock:abc')
    expect(mocks.get).toHaveBeenCalledWith('stock:1')
  })
})
