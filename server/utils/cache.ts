import { redis } from '../db'

const EMPTY = '__EMPTY__'
const EMPTY_TTL = 10
const inflight = new Map<string, Promise<any>>()

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
      const data = await fetcher()
      if (data == null) {
        await redis.set(key, EMPTY, 'EX', EMPTY_TTL)
      } else {
        await redis.set(key, JSON.stringify(data), 'EX', jitter(ttl))
      }
      return data
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export async function invalidate(key: string) {
  await redis.del(key)
}
