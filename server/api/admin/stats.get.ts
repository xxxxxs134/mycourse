import { sql } from 'drizzle-orm'
import { db, courses, orders, eq } from '../../db'
import { requireAdmin } from '../../utils/auth'

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

  const pending = await db.select({ count: sql<number>`count(*)` }).from(orders)
    .where(eq(orders.paid, false))

  const soldByCourse = new Map<number, number>()
  for (const row of soldAgg) soldByCourse.set(row.courseId, Number(row.count))

  const list = courseRows.map((c) => {
    const sold = soldByCourse.get(c.id) ?? 0
    const status = c.stock <= 0 ? 'soldout' : c.stock <= LOW_STOCK ? 'low' : 'ok'
    return { ...c, sold, status }
  })

  return {
    stats: {
      totalCourses: list.length,
      totalStock: list.reduce((s, c) => s + c.stock, 0),
      totalSold: list.reduce((s, c) => s + c.sold, 0),
      lowStockCount: list.filter((c) => c.status !== 'ok').length,
      pendingOrders: Number(pending[0]?.count ?? 0)
    },
    courses: list
  }
})
