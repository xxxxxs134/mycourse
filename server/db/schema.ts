import { mysqlTable, text, int, datetime, boolean, varchar, index,uniqueIndex } from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 50 }).notNull(),
  passwordHash: varchar('password_hash', { length: 256 }).notNull(),
  nickname: varchar('nickname', { length: 50 }).default(''),
  createdAt: datetime('created_at').notNull()
}, (table) => [
  uniqueIndex('uk_users_username').on(table.username)
])

export const courses = mysqlTable('courses', {
  id: int('id').primaryKey().autoincrement(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: int('price').notNull(),
  stock: int('stock').notNull().default(0),
  onSale: boolean('on_sale').notNull().default(true),
  content: text('content').notNull().default(''),
  createdAt: datetime('created_at').notNull()
})

export const orders = mysqlTable('orders', {
  id: int('id').primaryKey().autoincrement(),
  courseId: int('course_id').notNull()
    .references(() => courses.id),
  userId: int('user_id').references(() => users.id),
  orderId: varchar('order_id', { length: 36 }).notNull(),
  amount: int('amount').notNull().default(0),
  channel: varchar('channel', { length: 32 }).notNull().default('wechat'),
  paid: boolean('paid').notNull().default(false),
  released: boolean('released').notNull().default(false),
  createdAt: datetime('created_at').notNull()
}, (table) => [
  uniqueIndex('uk_orders_order_id').on(table.orderId),
  index('idx_orders_course_id').on(table.courseId),
  index('idx_orders_paid').on(table.paid),
  index('idx_orders_created_at').on(table.createdAt)
])
export const orderPayments = mysqlTable('order_payments', {
  id: int('id').primaryKey().autoincrement(),
  orderId: varchar('order_id', { length: 36 }).notNull(),
  transactionId: varchar('transaction_id', { length: 64 }).notNull(),
  channel: varchar('channel', { length: 32 }).notNull(),
  amount: int('amount').notNull(),
  createdAt: datetime('created_at').notNull()
}, (table) => [
  uniqueIndex('uk_order_payments_txn').on(table.transactionId),
  index('idx_order_payments_order').on(table.orderId)
])