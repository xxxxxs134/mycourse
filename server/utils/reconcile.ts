import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../db'
import { countAllPending, listPendingCourseIds, SOLD_PREFIX, setSold } from './stock'

const KEY_STOCK_PREFIX = 'stock:'
const KEY_PENDING_PREFIX = 'pending:'

// 双向对账 CAS：仅当当前值仍等于预期 cur 时才 SET（防止覆盖并发 checkout 的 DECR）。
// 返回值：1 已修正，0 未修正（值已变化），-1 无需修正
const RECONCILE_CAS_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local expected = tonumber(ARGV[1])
local avail = tonumber(ARGV[2])
if cur ~= expected then
  return 0
end
if cur == avail then
  return -1
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
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

/** R5/R6：清理「订单已支付但 pending 残留」的孤儿条目，并修正库存 */
async function cleanupPaidPending(rows: { id: number }[], paidMap: Map<number, number>): Promise<number> {
  let fixed = 0
  const allPendingIds = await listPendingCourseIds()
  for (const courseId of allPendingIds) {
    const pendingIds = await redis.zrange(`${KEY_PENDING_PREFIX}${courseId}`, 0, -1)
    if (pendingIds.length === 0) continue
    // 该课程所有已支付订单 orderId
    const paidRows = await db.select({ orderId: orders.orderId }).from(orders)
      .where(sql`${orders.courseId} = ${courseId} and ${orders.paid} = true`)
    const paidSet = new Set(paidRows.map((r) => r.orderId))
    const toRemove = pendingIds.filter((id) => paidSet.has(id))
    if (toRemove.length > 0) {
      await redis.zrem(`${KEY_PENDING_PREFIX}${courseId}`, ...toRemove)
      fixed += toRemove.length
    }
  }
  return fixed
}

export async function reconcileStock(): Promise<number> {
  const rows = await db.select({ id: courses.id, stock: courses.stock }).from(courses)
  const [paid, pending] = await Promise.all([paidCountByCourse(), pendingCountByCourse()])

  let fixed = 0

  // R5/R6：清理已支付订单的 pending 残留（避免库存双计偏低）
  fixed += await cleanupPaidPending(rows, paid)

  // R8：双向对账（CAS 防并发覆盖）
  for (const row of rows) {
    const sold = paid.get(row.id) ?? 0
    const reserved = pending.get(row.id) ?? 0
    const available = Math.max(row.stock - sold - reserved, 0)
    const key = `${KEY_STOCK_PREFIX}${row.id}`

    // 读当前值，CAS 写回（双向：偏高拉低/偏低拉高，但不覆盖并发 DECR）
    const cur = Number(await redis.get(key)) || 0
    if (cur !== available) {
      const r = Number(await redis.eval(RECONCILE_CAS_SCRIPT, 1, key, String(cur), String(available)))
      if (r === 1) fixed++
    }

    // 校准销量计数：以 MySQL 权威值覆盖 Redis（防止漏记导致计数偏低）
    const curSold = Number(await redis.get(`${SOLD_PREFIX}${row.id}`)) || 0
    if (sold !== curSold) {
      await setSold(row.id, sold)
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
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${SOLD_PREFIX}*`, 'COUNT', 200)
    cursor = next
    for (const key of keys) {
      const id = Number(key.slice(SOLD_PREFIX.length))
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
