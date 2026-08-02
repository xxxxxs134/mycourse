import { redis } from '../db'

const EMPTY = '__EMPTY__'
const EMPTY_TTL = 10
const inflight = new Map<string, Promise<any>>()

const LOCK_PREFIX = 'cache:lock:'
const LOCK_TTL_SEC = 10

export function jitter(base: number): number {
  return base + Math.floor(Math.random() * base * 0.2)
}

export async function withCache<T>(key: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  const cached = await redis.get(key)
  if (cached !== null) {
    return cached === EMPTY ? null : JSON.parse(cached)
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const p = (async () => {
    try {
      const lockOk = await redis.set(`${LOCK_PREFIX}${key}`, '1', 'EX', LOCK_TTL_SEC, 'NX')
      if (!lockOk) {
        const retry = await redis.get(key)
        if (retry !== null) {
          return retry === EMPTY ? null : JSON.parse(retry)
        }
        await new Promise((r) => setTimeout(r, 10))
        const again = await redis.get(key)
        if (again !== null) {
          return again === EMPTY ? null : JSON.parse(again)
        }
      }
      const data = await fetcher()
      if (data == null) {
        await redis.set(key, EMPTY, 'EX', EMPTY_TTL)
      } else {
        await redis.set(key, JSON.stringify(data), 'EX', jitter(ttl))
      }
      return data
    } finally {
      inflight.delete(key)
      await redis.del(`${LOCK_PREFIX}${key}`)
    }
  })()
  inflight.set(key, p)
  return p
}

export async function invalidate(key: string) {
  await redis.del(key)
}
