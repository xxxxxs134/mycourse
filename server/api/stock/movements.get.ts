import { sql, and, desc } from 'drizzle-orm'
import { db, stockMovements, courses, eq } from '../../db'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const courseId = query.courseId !== undefined ? Number(query.courseId) : undefined
  const type = typeof query.type === 'string' && query.type ? query.type : undefined
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const offset = (page - 1) * pageSize

  const conditions = []
  if (courseId && Number.isFinite(courseId)) conditions.push(eq(stockMovements.courseId, courseId))
  if (type) conditions.push(eq(stockMovements.type, type))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countRows] = await Promise.all([
    db.select({
      id: stockMovements.id,
      courseId: stockMovements.courseId,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      beforeQty: stockMovements.beforeQty,
      afterQty: stockMovements.afterQty,
      remark: stockMovements.remark,
      createdAt: stockMovements.createdAt,
      title: courses.title
    })
      .from(stockMovements)
      .leftJoin(courses, eq(courses.id, stockMovements.courseId))
      .where(where)
      .orderBy(desc(stockMovements.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ cnt: sql<number>`count(*)` })
      .from(stockMovements)
      .where(where)
  ])

  const total = Number(countRows[0]?.cnt ?? 0)

  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      title: r.title ?? '',
      type: r.type,
      quantity: r.quantity,
      beforeQty: r.beforeQty,
      afterQty: r.afterQty,
      remark: r.remark,
      createdAt: r.createdAt
    }))
  }
})
