import { redis } from '../db'
import { listPendingCourseIds, listExpiredPending, releasePendingOrder } from './stock'

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
      if (result > 0) released++
    }
  }

  if (released > 0) {
    await redis.del('courses:list')
  }
  return released
}
