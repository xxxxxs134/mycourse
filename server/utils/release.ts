import { listPendingCourseIds, listExpiredPending, releasePendingOrder } from './stock'
import { invalidateCourseList } from './cache'
import { recordMovement } from './stockMovement'
import { redis } from '../db'

export const ORDER_TTL_SECONDS = Number(process.env.ORDER_TTL_SECONDS) || 5 * 60
const STATE_KEY_TTL = 86400

export async function releaseExpiredOrders(): Promise<number> {
  const cutoff = Date.now() - ORDER_TTL_SECONDS * 1000

  let released = 0
  const courseIds = await listPendingCourseIds()
  for (const courseId of courseIds) {
    const expired = await listExpiredPending(courseId, cutoff)
    for (const orderId of expired) {
      const result = await releasePendingOrder(courseId, orderId, STATE_KEY_TTL)
      if (result > 0) {
        released++
        // 超时释放：库存 +1，记 release 流水
        const current = Number(await redis.get(`stock:${courseId}`)) || 0
        await recordMovement({
          courseId,
          type: 'release',
          quantity: 1,
          beforeQty: current,
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
