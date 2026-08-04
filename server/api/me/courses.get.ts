import { eq, and } from 'drizzle-orm'
import { db, courses, orders, redis } from '../../db'
import { requireCustomer } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { uid } = await requireCustomer(event)

  const rows = await db.select({
    id: courses.id,
    title: courses.title,
    description: courses.description,
    price: courses.price,
    category: courses.category,
    cover: courses.cover,
    onSale: courses.onSale,
    paidAt: orders.createdAt
  })
    .from(orders)
    .innerJoin(courses, eq(courses.id, orders.courseId))
    .where(and(eq(orders.paid, true), eq(orders.userId, uid)))
    .orderBy(orders.createdAt)

  const list = rows.length > 0
    ? await Promise.all(rows.map(async (r) => {
        const stock = await redis.get(`stock:${r.id}`)
        return { ...r, stock: stock !== null ? Number(stock) : undefined }
      }))
    : []

  return list
})
