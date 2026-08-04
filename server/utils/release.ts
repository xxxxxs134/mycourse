import { sql } from 'drizzle-orm'
import { listPendingCourseIds, listExpiredPending, releasePendingOrder } from './stock'
import { invalidateCourseList } from './cache'
import { recordMovement } from './stockMovement'
import { redis, db, orders } from '../db'

export const ORDER_TTL_SECONDS = Number(process.env.ORDER_TTL_SECONDS) || 5 * 60
const STATE_KEY_TTL = 86400

export async function releaseExpiredOrders(): Promise<number> {
  const cutoff = Date.now() - ORDER_TTL_SECONDS * 1000

  let released = 0
  const courseIds = await listPendingCourseIds()
  for (const courseId of courseIds) {
    const expired = await listExpiredPending(courseId, cutoff)
    if (expired.length === 0) continue

    // R7 修复：预检该课程已支付订单，避免 state key 过期后误释放已支付订单导致库存超计
    const paidOrderIds = new Set<string>()
    const paidRows = await db.select({ orderId: orders.orderId }).from(orders)
      .where(sql`${orders.courseId} = ${courseId} and ${orders.paid} = true`)
    for (const row of paidRows) paidOrderIds.add(row.orderId)

    for (const orderId of expired) {
      // 已支付订单（可能 state key 已过期）跳过释放
      if (paidOrderIds.has(orderId)) continue

      // 释放前读库存作为流水 beforeQty（Lua 内部会 INCR，之后读是 +1 后的值）
      const beforeQty = Number(await redis.get(`stock:${courseId}`)) || 0
      const result = await releasePendingOrder(courseId, orderId, STATE_KEY_TTL)
      if (result > 0) {
        released++
        // 超时释放：库存 +1，记 release 流水
        await recordMovement({
          courseId,
          type: 'release',
          quantity: 1,
          beforeQty,
          remark: `订单 ${orderId} 超时释放`
        })
      }
    }
  }

  if (released > 0) {
    await invalidateCourseList()
  }
  return released
}
