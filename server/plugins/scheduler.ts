import { releaseExpiredOrders } from '../utils/release'
import { reconcileStock } from '../utils/reconcile'
import { redis } from '../db'

const SCAN_INTERVAL_MS = 30 * 1000
const LOCK_KEY = 'scheduler:lock'
const LOCK_TTL_SEC = 55

async function acquire(): Promise<boolean> {
  const ok = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SEC, 'NX')
  return ok === 'OK'
}

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    if (!(await acquire())) return
    try {
      await reconcileStock()
      await releaseExpiredOrders()
    } catch (err: any) {
      console.warn('[scheduler] 执行失败:', err.message)
    }
  }, SCAN_INTERVAL_MS)
  timer.unref()
})
