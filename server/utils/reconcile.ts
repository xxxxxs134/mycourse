import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { countAllPending, listPendingCourseIds } from './stock'

const KEY_STOCK_PREFIX = 'stock:'
const KEY_PENDING_PREFIX = 'pending:'

// 原子对账：仅当权威值(available) < 当前值时写入。
// 并发 checkout 的 DECR 使当前值变低，这里不会把低值拉回高值（防超卖）；
// 泄漏导致的 Redis 偏低由下次 checkout 的 ensureStock(SET NX) 补齐。
const RECONCILE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local avail = tonumber(ARGV[1])
if avail < cur then
  redis.call('SET', KEYS[1], ARGV[1])
  return 1
end
return 0
`

async function pendingCountByCourse(): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const ids = await listPendingCourseIds()
  for (const id of ids) {
    map.set(id, await redis.zcard(`${KEY_PENDING_PREFIX}${id}`))
  }
  return map
}

async function paidCountByCourse(): Promise<Map<number, number>> {
  const rows = await db.select({
    courseId: orders.courseId,
    count: sql<number>`count(*)`
  }).from(orders)
    .where(eq(orders.paid, true))
    .groupBy(orders.courseId)
  const map = new Map<number, number>()
  for (const row of rows) map.set(row.courseId, Number(row.count))
  return map
}

export async function reconcileStock(): Promise<number> {
  const rows = await db.select({ id: courses.id, stock: courses.stock }).from(courses)
  const [paid, pending] = await Promise.all([paidCountByCourse(), pendingCountByCourse()])

  let fixed = 0
  for (const row of rows) {
    const sold = paid.get(row.id) ?? 0
    const reserved = pending.get(row.id) ?? 0
    const available = Math.max(row.stock - sold - reserved, 0)
    const key = `${KEY_STOCK_PREFIX}${row.id}`
    fixed += Number(await redis.eval(RECONCILE_SCRIPT, 1, key, String(available)))
  }

  const live = new Set(rows.map((r) => r.id))
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'stock:*', 'COUNT', 200)
    cursor = next
    for (const key of keys) {
      const id = Number(key.slice(KEY_STOCK_PREFIX.length))
      if (Number.isNaN(id) || !live.has(id)) {
        await redis.del(key)
        fixed++
      }
    }
  } while (cursor !== '0')

  cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'pending:*', 'COUNT', 200)
    cursor = next
    for (const key of keys) {
      const id = Number(key.slice(KEY_PENDING_PREFIX.length))
      if (Number.isNaN(id) || !live.has(id)) {
        await redis.del(key)
        fixed++
      }
    }
  } while (cursor !== '0')

  return fixed
}

export async function reconcilePendingStats(): Promise<number> {
  return countAllPending()
}
