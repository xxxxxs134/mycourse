import { redis } from '../db'
import { PAY_QUEUE, PAY_GROUP, PAY_DEAD, isStreamSupported, ensureGroup } from '../utils/payQueue'
import { confirmPayment } from '../utils/paymentConfirm'

const BLOCK_MS = 2000
const MAX_RETRIES = 3
let running = false

/** 单条消息：解析 → confirmPayment → ACK；确认失败重试，超限进死信 */
async function handleMessage(streamId: string, fields: (string | number)[]): Promise<void> {
  const data: Record<string, string> = {}
  for (let i = 0; i + 1 < fields.length; i += 2) {
    data[String(fields[i])] = String(fields[i + 1])
  }
  const orderId = data.orderId || ''
  const channel = data.channel || 'wechat'

  if (!orderId) {
    await redis.xack(PAY_QUEUE, PAY_GROUP, streamId)
    return
  }

  const amount = Number(data.amount) || 0
  let lastErr: string | undefined
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await confirmPayment({
        orderId,
        channel,
        transactionId: null,
        callbackAmount: amount
      })
      if (!result.ok) {
        lastErr = result.error
        await new Promise((r) => setTimeout(r, 200 * attempt))
        continue
      }
      await redis.xack(PAY_QUEUE, PAY_GROUP, streamId)
      return
    } catch (err: any) {
      lastErr = err?.message || String(err)
      await new Promise((r) => setTimeout(r, 200 * attempt))
    }
  }

  // 重试耗尽：进死信队列（保留原消息，便于排查）
  await redis.xadd(PAY_DEAD, '*', 'orderId', orderId, 'channel', channel, 'error', lastErr || 'unknown')
  await redis.xack(PAY_QUEUE, PAY_GROUP, streamId)
}

async function consumeLoop(): Promise<void> {
  if (running) return
  running = true
  try {
    const res = await redis.xreadgroup('GROUP', PAY_GROUP, 'worker', 'COUNT', 10, 'BLOCK', BLOCK_MS, 'STREAMS', PAY_QUEUE, '>')
    // 返回结构：[[streamName, [[id, [field, value, ...]], ...]], ...]
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
    if (!stopped) {
      timer = setTimeout(poll, 0)
      timer.unref()
    }
  })

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
