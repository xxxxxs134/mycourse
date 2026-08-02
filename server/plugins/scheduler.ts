import { releaseExpiredOrders } from '../utils/release'
import { reconcileStock } from '../utils/reconcile'

const SCAN_INTERVAL_MS = 30 * 1000

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    try {
      await reconcileStock()
      await releaseExpiredOrders()
    } catch (err: any) {
      console.warn('[scheduler] 执行失败:', err.message)
    }
  }, SCAN_INTERVAL_MS)
  timer.unref()
})
