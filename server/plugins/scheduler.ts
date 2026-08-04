import { releaseExpiredOrders } from '../utils/release'
import { reconcileStock } from '../utils/reconcile'
import { redis } from '../db'
import { randomUUID } from 'node:crypto'

const SCAN_INTERVAL_MS = 30 * 1000
const LOCK_KEY = 'scheduler:lock'
const LOCK_TTL_SEC = 55
const RENEW_INTERVAL_MS = 20 * 1000

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

// 看门狗续期：仅当 token 仍持有锁时延长 TTL（防止任务超时被并发实例抢锁）
const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
`

async function acquire(): Promise<string | null> {
  const token = randomUUID()
  const ok = await redis.set(LOCK_KEY, token, 'EX', LOCK_TTL_SEC, 'NX')
  return ok === 'OK' ? token : null
}

async function renew(token: string): Promise<void> {
  await redis.eval(RENEW_LOCK_SCRIPT, 1, LOCK_KEY, token, String(LOCK_TTL_SEC))
}

async function release(token: string) {
  await redis.eval(RELEASE_LOCK_SCRIPT, 1, LOCK_KEY, token)
}

export default defineNitroPlugin(() => {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    const token = await acquire()
    if (!token) return
    running = true

    // 看门狗：任务执行期间定期续期，防止 reconcile/release 超时锁过期导致多实例并行
    const watchdog = setInterval(() => {
      renew(token).catch(() => {})
    }, RENEW_INTERVAL_MS)
    watchdog.unref()

    try {
      await reconcileStock()
      await releaseExpiredOrders()
    } catch (err: any) {
      console.warn('[scheduler] 执行失败:', err.message)
    } finally {
      clearInterval(watchdog)
      running = false
      await release(token)
    }
  }, SCAN_INTERVAL_MS)
  timer.unref()
})
