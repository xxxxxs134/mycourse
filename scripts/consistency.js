import { createPool } from 'mysql2/promise'
import Redis from 'ioredis'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const PORT = 3200
const BASE = `http://127.0.0.1:${PORT}`
const BUILT_SERVER = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))

function loadEnv() {
  const out = {}
  try {
    const text = readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {}
  return out
}

async function main() {
  const env = loadEnv()
  const db = createPool({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 5 })
  const redis = new Redis(env.REDIS_URL || 'redis://127.0.0.1:6379')
  const marker = `consis-${Date.now()}`
  const INITIAL_STOCK = 200

  let server
  try {
    server = spawn('node', [BUILT_SERVER], {
      env: { ...process.env, ...env, PORT: String(PORT), NITRO_CLUSTER_WORKERS: '2', MOCK_SIGN_SECRET: 'consis-mock', CHECKOUT_RATE_LIMIT: '100000', ENABLE_MOCK_WEBHOOK: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const start = Date.now()
    let ready = false
    while (Date.now() - start < 30000) {
      try {
        const res = await fetch(`${BASE}/api/courses`)
        if (res.status < 500) { ready = true; break }
      } catch {}
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!ready) throw new Error('server not ready')

    // admin 建课程 + 设库存
    const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: env.ADMIN_USER, password: env.ADMIN_PASS }) })
    const { token } = await login.json()
    const created = await fetch(`${BASE}/api/courses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ title: `一致性课程 ${marker}`, description: '', price: 100 }) })
    const courseId = (await created.json()).id
    await fetch(`${BASE}/api/courses/${courseId}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ stock: INITIAL_STOCK }) })

    // 注册客户
    const cust = `c_${Date.now()}`
    const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: cust, password: 'password123' }) })
    const { token: custToken } = await reg.json()

    // 并发下单 1000 次，统计成功/售罄
    const CONCURRENCY = 50
    const TOTAL = 1000
    let success = 0
    let soldOut = 0
    const orderIds = []
    let next = 0
    async function worker() {
      while (true) {
        const i = next++
        if (i >= TOTAL) return
        try {
          const res = await fetch(`${BASE}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${custToken}` }, body: JSON.stringify({ id: courseId, channel: 'mock' }) })
          if (res.status === 200) {
            success++
            const { orderId, amount_cent } = await res.json()
            orderIds.push({ orderId, amount: amount_cent })
          } else if (res.status === 410) {
            soldOut++
          } else {
            console.warn(`下单异常状态: ${res.status}`)
          }
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    console.log(`\n=== 并发下单 ${TOTAL} 次 ===`)
    console.log(`成功: ${success} | 售罄: ${soldOut}`)

    // 并发支付确认全部成功订单（幂等验证）
    let confirmOk = 0
    let confirmFail = 0
    async function payer() {
      while (true) {
        const item = orderIds.pop()
        if (!item) return
        try {
          const rawBody = JSON.stringify({ out_trade_no: item.orderId, transaction_id: `txn_${item.orderId}`, amount: item.amount })
          const ts = String(Math.floor(Date.now() / 1000))
          const nonce = Math.random().toString(36).slice(2)
          const sig = createHmac('sha256', 'consis-mock').update(`${ts}\n${nonce}\n${rawBody}\n`).digest('hex')
          const res = await fetch(`${BASE}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pay-channel': 'mock', 'wechatpay-timestamp': ts, 'wechatpay-nonce': nonce, 'wechatpay-signature': sig }, body: rawBody })
          if (res.status === 200) confirmOk++
          else confirmFail++
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, payer))
    console.log(`\n=== 并发支付确认 ===`)
    console.log(`确认成功: ${confirmOk} | 失败: ${confirmFail}`)

    // 等待 worker 异步确认完成（本机 3.0 同步，已即时；留 1s）
    await new Promise((r) => setTimeout(r, 1000))

    // 一致性校验：DB paid 订单数 == success；库存守恒 stock + sold + pending == INITIAL
    const [paidCount] = await db.query('SELECT COUNT(*) as c FROM orders WHERE course_id = ? AND paid = true', [courseId])
    const [stockRows] = await db.query('SELECT stock FROM courses WHERE id = ?', [courseId])
    const redisStock = Number(await redis.get(`stock:${courseId}`)) || 0
    const sold = Number(await redis.get(`sold:${courseId}`)) || 0
    const pending = await redis.zcard(`pending:${courseId}`)
    const dbPaid = Number(paidCount[0].c)

    console.log(`\n=== 一致性校验 ===`)
    console.log(`DB paid 订单: ${dbPaid} (期望 ${success})`)
    console.log(`Redis: stock=${redisStock} sold=${sold} pending=${pending}`)
    console.log(`守恒: stock+sold+pending = ${redisStock + sold + pending} (初始 ${INITIAL_STOCK})`)
    console.log(`超卖检查: success(${success}) <= INITIAL(${INITIAL_STOCK})? ${success <= INITIAL_STOCK}`)

    const consistent = dbPaid === success && (redisStock + sold + pending) === INITIAL_STOCK && success <= INITIAL_STOCK
    console.log(`\n结果: ${consistent ? 'PASS ✓ 无丢单无超卖' : 'FAIL ✗ 存在不一致'}`)

    // 清理
    await db.query('DELETE FROM order_payments WHERE order_id IN (SELECT order_id FROM orders WHERE course_id = ?)', [courseId])
    await db.query('DELETE FROM orders WHERE course_id = ?', [courseId])
    await db.query('DELETE FROM stock_movements WHERE course_id = ?', [courseId])
    await db.query('DELETE FROM courses WHERE id = ?', [courseId])
    await db.query('DELETE FROM users WHERE username = ?', [cust])
    await redis.del(`stock:${courseId}`, `sold:${courseId}`, `pending:${courseId}`)
  } finally {
    if (server && server.pid) {
      try {
        if (process.platform === 'win32') {
          const { execFile } = await import('node:child_process')
          await new Promise((r) => execFile('taskkill', ['/pid', String(server.pid), '/T', '/F'], () => r()))
        } else server.kill('SIGTERM')
      } catch {}
    }
    await redis.quit().catch(() => {})
    await db.end().catch(() => {})
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
