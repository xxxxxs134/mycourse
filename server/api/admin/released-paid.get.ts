import { redis } from '../../db'
import { requireAdmin } from '../../utils/auth'

// 查询「已释放订单但收到支付回调」的待人工处理列表（需人工退款）
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const ids = await redis.zrange('released_paid:orders', 0, -1)
  const items = []
  for (const orderId of ids) {
    const score = await redis.zscore('released_paid:orders', orderId)
    items.push({ orderId, receivedAt: Number(score) || 0 })
  }
  // 时间倒序（最近在前）
  items.sort((a, b) => b.receivedAt - a.receivedAt)
  return { items, total: items.length }
})
