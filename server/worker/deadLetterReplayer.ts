import { workerRedis } from '../db'
import { PAY_DEAD, PAY_GROUP, isStreamSupported, waitRedisReady } from '../utils/payQueue'
import { confirmPayment } from '../utils/paymentConfirm'

const REAP_INTERVAL_MS = 5 * 60 * 1000
const MAX_DEAD_RETRY = 3

/**
 * 死信重放器：定期消费 pay_dead，重试确认支付（confirmPayment 幂等）。
 * 仍失败则写回死信并告警（多次重放仍失败 = 需人工介入）。
 */
export function startDeadLetterReplayer() {
  let timer: ReturnType<typeof setInterval> | null = null
  let stopped = false

  const reap = async () => {
    if (stopped) return
    try {
      if (!(await isStreamSupported())) return
      // 创建消费组（首次）
      try {
        await workerRedis.xgroup('CREATE', PAY_DEAD, PAY_GROUP, '0', 'MKSTREAM')
      } catch (e: any) {
        if (!String(e?.message).includes('BUSYGROUP')) throw e
      }

      const res = await workerRedis.xreadgroup('GROUP', PAY_GROUP, 'replayer', 'COUNT', 20, 'BLOCK', 100, 'STREAMS', PAY_DEAD, '>')
      const streams = (res ?? []) as Array<[string, Array<[string, (string | number)[]]>]>
      for (const [, messages] of streams) {
        for (const [id, fields] of messages) {
          const data: Record<string, string> = {}
          for (let i = 0; i + 1 < fields.length; i += 2) data[String(fields[i])] = String(fields[i + 1])
          const orderId = data.orderId || ''
          const channel = data.channel || 'wechat'
          const amount = Number(data.amount) || 0
          const retries = Number(data.retries) || 0

          let ok = false
          if (orderId) {
            try {
              const result = await confirmPayment({ orderId, channel, transactionId: null, callbackAmount: amount })
              ok = result.ok
            } catch {
              ok = false
            }
          }

          await workerRedis.xack(PAY_DEAD, PAY_GROUP, id).catch(() => {})
          if (!ok && retries < MAX_DEAD_RETRY) {
            // 重放仍失败：写回死信并计数，超过阈值告警
            await workerRedis.xadd(PAY_DEAD, '*', 'orderId', orderId, 'channel', channel, 'amount', String(amount), 'retries', String(retries + 1))
            if (retries + 1 >= MAX_DEAD_RETRY) {
              console.warn(`[replayer] 订单 ${orderId} 重放 ${MAX_DEAD_RETRY} 次仍失败，需人工介入`)
            }
          } else if (!ok) {
            console.warn(`[replayer] 订单 ${orderId} 重放超限，已移除需人工核查`)
          }
        }
      }
    } catch (err: any) {
      console.warn('[replayer] 重放异常:', err?.message || err)
    }
  }

  isStreamSupported().then(async (ok) => {
    if (!ok || stopped) return
    if (!(await waitRedisReady(workerRedis))) return
    reap()
    timer = setInterval(reap, REAP_INTERVAL_MS)
    timer.unref()
  })

  return () => {
    stopped = true
    if (timer) clearInterval(timer)
  }
}
