import autocannon from 'autocannon'
import { createPool } from 'mysql2/promise'
import Redis from 'ioredis'
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

const env = loadEnv()
const marker = `bench-${Date.now()}`

async function main() {
  const db = createPool({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 2 })
  const redis = new Redis(env.REDIS_URL || 'redis://127.0.0.1:6379')
  let courseId = 0
  let server = null

  try {
    server = spawn('node', [BUILT_SERVER], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ...env, PORT: String(PORT), NITRO_CLUSTER_WORKERS: process.env.BENCH_WORKERS || '2', CHECKOUT_RATE_LIMIT: '100000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`))

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

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.ADMIN_USER, password: env.ADMIN_PASS }),
    })
    const { token } = await login.json()
    const created = await fetch(`${BASE}/api/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `压测课程 ${marker}`, description: 'bench', price: 100, content: 'c' }),
    })
    courseId = (await created.json()).id
    await fetch(`${BASE}/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ stock: 1000000 }),
    })

    const firstCheckout = await fetch(`${BASE}/api/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: courseId, channel: 'mock' }),
    })
    const { orderId } = await firstCheckout.json()

    const scenarios = [
      { name: 'GET /api/courses', method: 'GET', path: '/api/courses' },
      { name: 'POST /api/checkout', method: 'POST', path: '/api/checkout', body: { id: courseId, channel: 'mock' } },
      { name: 'GET /api/order-status (真实待支付订单)', method: 'GET', path: `/api/order-status?orderId=${orderId}` },
    ]

    for (const s of scenarios) {
      const result = await autocannon({
        url: `${BASE}${s.path}`,
        method: s.method,
        body: s.body ? JSON.stringify(s.body) : undefined,
        headers: s.body ? { 'content-type': 'application/json' } : undefined,
        connections: Number(process.env.BENCH_CONNS) || 100,
        duration: 5,
        timeout: 15,
      })
      console.log(`\n=== ${s.name} ===`)
      console.log(`  吞吐: ${Math.round(result.requests.average)} req/s (总 ${result.requests.total})`)
      console.log(`  延迟 p50/p90/p99: ${Math.round(result.latency.p50)}/${Math.round(result.latency.p90)}/${Math.round(result.latency.p99)} ms`)
      console.log(`  错误: ${result.errors} | 非2xx: ${result.non2xx}`)
    }
  } finally {
    if (server && server.pid) {
      try {
        const { execFile } = await import('node:child_process')
        if (process.platform === 'win32') await new Promise((r) => execFile('taskkill', ['/pid', String(server.pid), '/T', '/F'], () => r()))
        else server.kill('SIGTERM')
      } catch {}
    }
    if (courseId) {
      try { await db.query('DELETE FROM order_payments WHERE order_id IN (SELECT order_id FROM orders WHERE course_id = ?)', [courseId]) } catch {}
      try { await db.query('DELETE FROM orders WHERE course_id = ?', [courseId]) } catch {}
      try { await db.query('DELETE FROM courses WHERE id = ?', [courseId]) } catch {}
      try { await redis.del(`stock:${courseId}`, `pending:${courseId}`, 'courses:list', `course:${courseId}:meta`) } catch {}
    }
    try { await redis.quit() } catch {}
    try { await db.end() } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
