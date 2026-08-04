import { db, orders, redis, orderPayments, eq } from '../db'
import { getPendingOrder, removePending, removeOrder, incrSold } from './stock'
import { recordMovement } from './stockMovement'
import { invalidateCourseList } from './cache'

// 支付成功指标计数（近 1 分钟滑动），供 /api/admin/metrics 观察
const PAY_SUCCESS_KEY = 'metrics:pay_success'
const PAY_SUCCESS_WINDOW_MS = 60_000

export interface ConfirmPaymentParams {
  orderId: string
  channel: string
  transactionId: string | null
  callbackAmount: number
}

export interface ConfirmPaymentResult {
  ok: boolean
  duplicate?: boolean
  error?: string
}

/**
 * 支付确认核心逻辑（webhook 与 worker 共用，幂等）：
 * 1. 校验 pending 订单存在 + 金额一致
 * 2. 落库 order_payments + orders（事务，ER_DUP_ENTRY 兜底幂等）
 * 3. 移除 pending/order hash，失效缓存
 * 4. 记 sale 流水（quantity=0）+ INCR sold
 *
 * 注意：调用方负责 state key 的 NX 抢占（防重复入队），此处不再管理 state。
 */
export async function confirmPayment(params: ConfirmPaymentParams): Promise<ConfirmPaymentResult> {
  const { orderId, channel, transactionId, callbackAmount } = params

  const pending = await getPendingOrder(orderId)
  if (!pending) {
    // 订单 hash 不存在（可能已被释放，或并发确认已先完成 removeOrder）。
    // 查 DB：若订单已确认（paid），视为幂等成功；否则记录待处理（R13）。
    const existing = (await db.select({ paid: orders.paid }).from(orders).where(eq(orders.orderId, orderId)).limit(1))[0]
    if (existing?.paid) {
      return { ok: true, duplicate: true }
    }
    console.warn(`[confirmPayment] 订单不存在或已超时: ${orderId}`)
    await redis.zadd('released_paid:orders', Date.now(), orderId).catch(() => {})
    return { ok: false, error: '订单不存在或已超时' }
  }

  if (callbackAmount !== pending.amount) {
    return { ok: false, error: '支付金额与订单金额不符' }
  }

  let duplicate = false
  let insertUserId = pending.userId
  try {
    await db.transaction(async (tx) => {
      await tx.insert(orderPayments).values({
        orderId,
        transactionId: transactionId ?? `txn_${orderId}`,
        channel,
        amount: pending.amount,
        createdAt: new Date()
      })
      await tx.insert(orders).values({
        courseId: pending.courseId,
        userId: insertUserId,
        orderId,
        amount: pending.amount,
        channel: pending.channel,
        paid: true,
        released: false,
        createdAt: new Date(pending.createdAt)
      })
    })
  } catch (err: any) {
    // drizzle mysql2 的 ER_DUP_ENTRY 可能在 err.code 或 err.cause.code
    const code = err?.code ?? err?.cause?.code
    if (code !== 'ER_DUP_ENTRY') {
      // 外键失败：用户可能已被删除（ER_NO_REFERENCED_ROW / 1216），降级为匿名订单重试一次
      const fkCode = err?.errno ?? err?.cause?.errno
      if (insertUserId !== null && (code === 'ER_NO_REFERENCED_ROW' || fkCode === 1216 || fkCode === 1452)) {
        console.warn(`[confirmPayment] 用户 ${insertUserId} 不存在，订单降级为匿名: ${orderId}`)
        insertUserId = null
        await db.transaction(async (tx) => {
          await tx.insert(orderPayments).values({
            orderId,
            transactionId: transactionId ?? `txn_${orderId}`,
            channel,
            amount: pending.amount,
            createdAt: new Date()
          })
          await tx.insert(orders).values({
            courseId: pending.courseId,
            userId: null,
            orderId,
            amount: pending.amount,
            channel: pending.channel,
            paid: true,
            released: false,
            createdAt: new Date(pending.createdAt)
          })
        })
        duplicate = false
      } else {
        throw err
      }
    } else {
      duplicate = true
    }
  }

  await removePending(pending.courseId, orderId)
  await removeOrder(orderId)
  await redis.del(`course:${pending.courseId}:meta`)
  await invalidateCourseList()

  // 支付确认 = 订单从「预扣」转为「已售」，库存不变（checkout 时已 DECR）。
  // 流水记数量 0、before/after 均为当前库存，反映状态转移而非库存变动。
  if (!duplicate) {
    const current = Number(await redis.get(`stock:${pending.courseId}`)) || 0
    await recordMovement({
      courseId: pending.courseId,
      type: 'sale',
      quantity: 0,
      beforeQty: current,
      remark: `订单 ${orderId} 支付成功`
    })
    await incrSold(pending.courseId)
  }

  // 指标：支付成功计数（滑动窗口）
  const now = Date.now()
  await redis.pipeline()
    .zadd(PAY_SUCCESS_KEY, now, orderId)
    .zremrangebyscore(PAY_SUCCESS_KEY, 0, now - PAY_SUCCESS_WINDOW_MS)
    .exec()
    .catch(() => {})

  return { ok: true, duplicate }
}
