import { sql, and, inArray } from 'drizzle-orm'
import { db, stockMovements, courses, redis } from '../../db'
import { requireAdmin } from '../../utils/auth'
import { countAllPending } from '../../utils/stock'

const LOW_STOCK = 10

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [courseRows, inAgg, outAgg, pending] = await Promise.all([
    db.select().from(courses),
    db.select({ qty: sql<number>`COALESCE(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(and(inArray(stockMovements.type, ['in', 'adjust']), sql`${stockMovements.quantity} > 0`)),
    db.select({ qty: sql<number>`COALESCE(sum(-${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(and(inArray(stockMovements.type, ['out', 'adjust']), sql`${stockMovements.quantity} < 0`)),
    countAllPending()
  ])

  let totalStock = 0
  let lowStockCount = 0
  for (const c of courseRows) {
    const s = Number(await redis.get(`stock:${c.id}`)) || 0
    totalStock += s
    if (s <= LOW_STOCK) lowStockCount++
  }

  return {
    totalCourses: courseRows.length,
    totalStock,
    totalIn: Number(inAgg[0]?.qty ?? 0),
    totalOut: Number(outAgg[0]?.qty ?? 0),
    lowStockCount,
    pendingOrders: pending
  }
})
