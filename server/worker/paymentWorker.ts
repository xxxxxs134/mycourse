import { redis } from '../db'
import { PAY_QUEUE, PAY_GROUP, PAY_DEAD, isStreamSupported, ensureGroup } from '../utils/payQueue'
import { confirmPayment } from '../utils/paymentConfirm'

const BLOCK_MS = 2000
const MAX_RETRIES = 3
let running = false

/**
 * 处理单条支付确认消息。
 * 崩溃安全设计：worker 拿到消息立即 XACK（应用层 ack），
 * 落库幂等由 MySQL uk_orders_order_id 唯一索引兜底；
 * confirmPayment 失败时重新入队（带重试计数），进程崩溃后重启仍能消费。
 */
async function handleMessage(streamId: string, fields: (string | number)[]): Promise<void> {
  const data: Record<string, string> = {}
  for (let i = 0; i + 1 < fields.length; i += 2) {
    data[String(fields[i])] = String(fields[i + 1])
  }
  const orderId = data.orderId || ''
  const channel = data.channel || 'wechat'
  const attempt = Number(data.attempt) || 1

  if (!orderId) {
    return
  }

  // 应用层 ack：先确认收到，落库幂等靠唯一索引
  await redis.xack(PAY_QUEUE, PAY_GROUP, streamId).catch(() => {})

  const amount = Number(data.amount) || 0
  try {
    const result = await confirmPayment({
      orderId,
      channel,
      transactionId: null,
      callbackAmount: amount
    })
    if (result.ok) {
      return
    }
    // 确认失败（订单不存在/金额不符等业务错误）：重试或死信
    if (attempt < MAX_RETRIES) {
      await redis.xadd(PAY_QUEUE, '*', 'orderId', orderId, 'channel', channel, 'amount', String(amount), 'attempt', String(attempt + 1))
    } else {
      await redis.xadd(PAY_DEAD, '*', 'orderId', orderId, 'channel', channel, 'error', result.error || '确认失败')
    }
  } catch (err: any) {
    // 系统异常（DB down/Redis down）：重试或死信
    if (attempt < MAX_RETRIES) {
      await redis.xadd(PAY_QUEUE, '*', 'orderId', orderId, 'channel', channel, 'amount', String(amount), 'attempt', String(attempt + 1))
    } else {
      await redis.xadd(PAY_DEAD, '*', 'orderId', orderId, 'channel', channel, 'error', err?.message || String(err))
    }
  }
}

/**
 * 接管遗留 PEL 消息（旧模式未 ACK / 崩溃残留）：
 * XPENDING 列出 PEL 中 IDLE 超阈值的消息 ID，XCLAIM 接管并重新处理。
 * （XAUTOCLAIM 需 Redis 6.2+，此处用 XCLAIM 兼容 Redis 5.0）
 */
async function reclaimPending(): Promise<void> {
  try {
    const pendingRes = await redis.xpending(PAY_QUEUE, PAY_GROUP, '-', '+', 50)
    // 返回 [[id, consumer, idle, deliveryCount], ...]
    const pending = (pendingRes ?? []) as Array<[string, string, number, number]>
    const staleIds = pending.filter((p) => Number(p[2]) > 5000).map((p) => p[0])
    if (staleIds.length === 0) return

    // XCLAIM stream group consumer min-idle-time id...
    const claimed = await redis.xclaim(PAY_QUEUE, PAY_GROUP, 'worker', 5000, ...staleIds)
    // 返回 [[id, [field,value,...]], ...]
    const claimedMsgs = (claimed ?? []) as Array<[string, (string | number)[]]>
    for (const [id, fields] of claimedMsgs) {
      await handleMessage(id, fields)
    }
  } catch (err: any) {
    console.warn('[worker] PEL 接管失败:', err?.message || err)
  }
}

async function consumeLoop(): Promise<void> {
  if (running) return
  running = true
  try {
    const res = await redis.xreadgroup('GROUP', PAY_GROUP, 'worker', 'COUNT', 10, 'BLOCK', BLOCK_MS, 'STREAMS', PAY_QUEUE, '>')
    const streams = (res ?? []) as Array<[string, Array<[string, (string | number)[]]>]>
    for (const [, messages] of streams) {
      for (const [id, fields] of messages) {
        await handleMessage(id, fields)
      }
    }
  } catch (err: any) {
    console.warn('[worker] 消费异常:', err?.message || err)
  } finally {
    running = false
  }
}

export function startPaymentWorker() {
  let timer: ReturnType<typeof setInterval> | null = null
  let reclaimTimer: ReturnType<typeof setInterval> | null = null
  let stopped = false

  const poll = async () => {
    if (stopped) return
    await consumeLoop()
    if (!stopped) {
      timer = setTimeout(poll, 50)
      timer.unref()
    }
  }

  isStreamSupported().then(async (ok) => {
    if (!ok || stopped) {
      console.warn('[worker] Redis 不支持 Stream，支付确认走 webhook 同步回退')
      return
    }
    await ensureGroup()
    // 启动时接管遗留 PEL（崩溃恢复），之后每 60s 巡检
    await reclaimPending()
    reclaimTimer = setInterval(() => {
      reclaimPending().catch(() => {})
    }, 60 * 1000)
    reclaimTimer.unref()
    if (!stopped) {
      timer = setTimeout(poll, 0)
      timer.unref()
    }
  })

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    if (reclaimTimer) clearInterval(reclaimTimer)
  }
}
