import { releaseExpiredOrders } from '../utils/release'
import { reconcileStock } from '../utils/reconcile'
import { redis } from '../db'
import { randomUUID } from 'node:crypto'

const SCAN_INTERVAL_MS = 30 * 1000
const LOCK_KEY = 'scheduler:lock'
const LOCK_TTL_SEC = 55

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

async function acquire(): Promise<string | null> {
  const token = randomUUID()
  const ok = await redis.set(LOCK_KEY, token, 'EX', LOCK_TTL_SEC, 'NX')
  return ok === 'OK' ? token : null
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
    try {
      await reconcileStock()
      await releaseExpiredOrders()
    } catch (err: any) {
      console.warn('[scheduler] 执行失败:', err.message)
    } finally {
      running = false
      await release(token)
    }
  }, SCAN_INTERVAL_MS)
  timer.unref()
})
