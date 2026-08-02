import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { countAllPending, listPendingCourseIds } from './stock'

const KEY_STOCK_PREFIX = 'stock:'
const KEY_PENDING_PREFIX = 'pending:'

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
    const current = await redis.get(key)
    if (current === null || Number(current) !== available) {
      await redis.set(key, String(available))
      fixed++
    }
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
