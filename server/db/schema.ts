import {mysqlTable,text,int,datetime,boolean} from 'drizzle-orm/mysql-core'

export const courses = mysqlTable('courses', {
  id: int("id").primaryKey().autoincrement(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: int('price').notNull(),
  stock: int('stock').notNull().default(0),
  content: text('content').notNull().default(''),
  createdAt: datetime('created_at').notNull()
})
export const orders = mysqlTable('orders', {
  id: int("id").primaryKey().autoincrement(),
  courseId: int('course_id').notNull(),
  orderId: text('order_id').notNull(),
  paid: boolean('paid').notNull().default(false),
  createdAt: datetime('created_at').notNull()
})