import { sql } from 'drizzle-orm'
import { db, courses, orders, redis, eq } from '../../db'
import { requireAdmin } from '../../utils/auth'
import { countAllPending } from '../../utils/stock'

const LOW_STOCK = 10

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const courseRows = await db.select().from(courses)

  const soldAgg = await db.select({
    courseId: orders.courseId,
    count: sql<number>`count(*)`
  }).from(orders)
    .where(eq(orders.paid, true))
    .groupBy(orders.courseId)

  const pending = await countAllPending()

  const soldByCourse = new Map<number, number>()
  for (const row of soldAgg) soldByCourse.set(row.courseId, Number(row.count))

  const stockValues = await redis.mget(courseRows.map((c) => `stock:${c.id}`))

  const list = courseRows.map((c, i) => {
    const sold = soldByCourse.get(c.id) ?? 0
    const stock = stockValues[i] !== null ? Number(stockValues[i]) : c.stock
    const status = stock <= 0 ? 'soldout' : stock <= LOW_STOCK ? 'low' : 'ok'
    return { ...c, stock, sold, status }
  })

  return {
    stats: {
      totalCourses: list.length,
      totalStock: list.reduce((s, c) => s + c.stock, 0),
      totalSold: list.reduce((s, c) => s + c.sold, 0),
      lowStockCount: list.filter((c) => c.status !== 'ok').length,
      pendingOrders: pending
    },
    courses: list
  }
})
