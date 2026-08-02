import { releaseExpiredOrders } from '../utils/release'

const SCAN_INTERVAL_MS = 30 * 1000

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    try {
      await releaseExpiredOrders()
    } catch (err: any) {
      console.warn('[release] 扫描失败:', err.message)
    }
  }, SCAN_INTERVAL_MS)
  timer.unref()
})
