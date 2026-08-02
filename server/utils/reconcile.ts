import { db, courses, redis } from '../db'

export async function reconcileStock(): Promise<number> {
  const rows = await db.select({ id: courses.id, stock: courses.stock }).from(courses)

  const live = new Set(rows.map((r) => r.id))
  const keyPrefix = 'stock:'

  const keys = await redis.keys(`${keyPrefix}*`)
  for (const key of keys) {
    const id = Number(key.slice(keyPrefix.length))
    if (Number.isNaN(id) || !live.has(id)) {
      await redis.del(key)
      continue
    }
    const current = Number(await redis.get(key))
    const dbStock = rows.find((r) => r.id === id)!.stock
    if (current !== dbStock) {
      await redis.set(key, String(dbStock))
    }
  }
  return keys.length
}
