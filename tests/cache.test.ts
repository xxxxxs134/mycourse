import { describe, it, expect, vi, beforeEach } from 'vitest'

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}))

vi.mock('../server/db', () => ({
  redis: redisMock,
}))

let jitter: typeof import('../server/utils/cache').jitter
let withCache: typeof import('../server/utils/cache').withCache
let invalidate: typeof import('../server/utils/cache').invalidate

beforeEach(async () => {
  vi.clearAllMocks()
  if (!jitter) {
    const mod = await import('../server/utils/cache')
    jitter = mod.jitter
    withCache = mod.withCache
    invalidate = mod.invalidate
  }
})

function cacheSetCalls() {
  return redisMock.set.mock.calls.filter((c: unknown[]) => typeof c[0] === 'string' && !(c[0] as string).startsWith('cache:lock:'))
}

describe('jitter', () => {
  it('在 base 到 base*1.2 之间', () => {
    for (let i = 0; i < 100; i++) {
      const v = jitter(60)
      expect(v).toBeGreaterThanOrEqual(60)
      expect(v).toBeLessThan(72)
    }
  })
})

describe('withCache', () => {
  it('命中时直接返回解析后的 JSON', async () => {
    redisMock.get.mockResolvedValue('{"id":1}')
    const fetcher = vi.fn()
    await expect(withCache('k', 60, fetcher)).resolves.toEqual({ id: 1 })
    expect(fetcher).not.toHaveBeenCalled()
    expect(redisMock.set).not.toHaveBeenCalled()
  })

  it('缓存为 EMPTY 标记时返回 null 且不调 fetcher', async () => {
    redisMock.get.mockResolvedValue('__EMPTY__')
    const fetcher = vi.fn()
    await expect(withCache('k', 60, fetcher)).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('未命中时调 fetcher 并写入带抖动的 TTL', async () => {
    redisMock.get.mockResolvedValue(null)
    redisMock.set.mockResolvedValue('OK')
    const fetcher = vi.fn().mockResolvedValue([{ id: 2 }])
    await expect(withCache('k', 60, fetcher)).resolves.toEqual([{ id: 2 }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    const calls = cacheSetCalls()
    expect(calls.length).toBe(1)
    const [key, val, mode, ttl] = calls[0]
    expect(key).toBe('k')
    expect(val).toBe('[{"id":2}]')
    expect(mode).toBe('EX')
    expect(ttl).toBeGreaterThanOrEqual(60)
    expect(ttl).toBeLessThan(72)
  })

  it('fetcher 返回 null 时写入 EMPTY 标记（短 TTL）', async () => {
    redisMock.get.mockResolvedValue(null)
    redisMock.set.mockResolvedValue('OK')
    const fetcher = vi.fn().mockResolvedValue(null)
    await expect(withCache('k', 60, fetcher)).resolves.toBeNull()
    const calls = cacheSetCalls()
    expect(calls.length).toBe(1)
    const [key, val, mode, ttl] = calls[0]
    expect(key).toBe('k')
    expect(val).toBe('__EMPTY__')
    expect(ttl).toBe(10)
  })

  it('并发调用共享同一个 inflight Promise', async () => {
    redisMock.get.mockResolvedValue(null)
    redisMock.set.mockResolvedValue('OK')
    let resolveFetcher: (v: { id: number }) => void
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetcher = resolve })
    )
    const p1 = withCache('k', 60, fetcher)
    const p2 = withCache('k', 60, fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    resolveFetcher!({ id: 9 })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ id: 9 })
    expect(r2).toEqual({ id: 9 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('invalidate', () => {
  it('删除缓存 key', async () => {
    redisMock.del.mockResolvedValue(1)
    await invalidate('k')
    expect(redisMock.del).toHaveBeenCalledWith('k')
  })
})
