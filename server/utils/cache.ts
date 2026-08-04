import { randomUUID } from 'node:crypto'
import { redis } from '../db'

const EMPTY = '__EMPTY__'
const EMPTY_TTL = 10
const inflight = new Map<string, Promise<any>>()

const LOCK_PREFIX = 'cache:lock:'
const LOCK_TTL_SEC = 10

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

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
    const lockToken = randomUUID()
    let ownsLock = false
    try {
      const lockOk = await redis.set(`${LOCK_PREFIX}${key}`, lockToken, 'EX', LOCK_TTL_SEC, 'NX')
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
        return null
      }
      ownsLock = true
      const data = await fetcher()
      if (data == null) {
        await redis.set(key, EMPTY, 'EX', EMPTY_TTL)
      } else {
        await redis.set(key, JSON.stringify(data), 'EX', jitter(ttl))
      }
      return data
    } finally {
      inflight.delete(key)
      if (ownsLock) {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, `${LOCK_PREFIX}${key}`, lockToken).catch(() => {})
      }
    }
  })()
  inflight.set(key, p)
  return p
}

export async function invalidate(key: string) {
  await redis.del(key)
}

/** 清除课程列表缓存（含分类/搜索子缓存），在课程增删改后调用 */
export async function invalidateCourseList() {
  const keys = ['courses:list']
  let cursor = '0'
  do {
    const [next, found] = await redis.scan(cursor, 'MATCH', 'courses:list:*', 'COUNT', 200)
    cursor = next
    keys.push(...found)
  } while (cursor !== '0')
  if (keys.length > 0) await redis.del(keys)
}
