import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { createPool, type Pool } from 'mysql2/promise'
import Redis from 'ioredis'
import { mockProvider } from '../server/utils/payments/mock'

const PORT = 3100
const BASE = `http://127.0.0.1:${PORT}`
const BUILT_SERVER = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))

const builtExists = existsSync(BUILT_SERVER)
const describeIntegration = builtExists ? describe : describe.skip

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const text = readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) {
        out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
  } catch {}
  return out
}

const env = loadEnv()

let server: ChildProcess
let db: Pool
let redis: Redis

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/courses`)
      if (res.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('server did not become ready')
}

describeIntegration('集成测试: 管理员 → 课程 → Mock 支付 → 解锁', () => {
  let token = ''
  let courseId = 0
  let zeroStockId = 0
  let auxId = 0
  let orderId = ''
  let rawBody = ''
  const marker = `e2e-${Date.now()}`

  beforeAll(async () => {
    db = createPool({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectionLimit: 2,
    })
    redis = new Redis(env.REDIS_URL || 'redis://127.0.0.1:6379')

    server = spawn('node', [BUILT_SERVER], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ...env, PORT: String(PORT), NITRO_CLUSTER_WORKERS: '2', NODE_ENV: 'test', MOCK_SIGN_SECRET: 'test-mock-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`))
    await waitForServer()
  }, 60000)

  afterAll(async () => {
    if (server && server.pid) {
      try {
        if (process.platform === 'win32') {
          const { execFile } = await import('node:child_process')
          await new Promise<void>((r) => {
            execFile('taskkill', ['/pid', String(server.pid!), '/T', '/F'], () => r())
          })
        } else {
          server.kill('SIGTERM')
          await new Promise((r) => setTimeout(r, 500))
        }
      } catch {}
    }
    if (redis) {
      if (courseId) { try { await redis.del(`stock:${courseId}`) } catch {} }
      if (zeroStockId) { try { await redis.del(`stock:${zeroStockId}`) } catch {} }
      if (auxId) { try { await redis.del(`stock:${auxId}`) } catch {} }
      try { await redis.del('courses:list') } catch {}
      if (orderId) {
        try { await redis.del(`order:${orderId}:state`, `order:${orderId}`) } catch {}
      }
      try { await redis.quit() } catch {}
    }
    if (db) {
      if (orderId) {
        try { await db.query('DELETE FROM order_payments WHERE order_id = ?', [orderId]) } catch {}
        try { await db.query('DELETE FROM orders WHERE order_id = ?', [orderId]) } catch {}
      }
      if (courseId || zeroStockId || auxId) {
        const ids = [courseId, zeroStockId, auxId].filter(Boolean)
        try { await db.query(`DELETE FROM courses WHERE id IN (${ids.map(() => '?').join(',')})`, ids) } catch {}
      }
      try { await db.end() } catch {}
    }
  }, 30000)

  it('登录: 密码错误返回 401', async () => {
    const res = await request(BASE).post('/api/auth/login').send({ username: env.ADMIN_USER, password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('登录: 正确凭据返回 token', async () => {
    const res = await request(BASE).post('/api/auth/login').send({ username: env.ADMIN_USER, password: env.ADMIN_PASS })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    token = res.body.token
  })

  it('auth/me: 带 token 返回管理员信息', async () => {
    const res = await request(BASE)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(true)
    expect(res.body.role).toBe('admin')
  })

  it('auth/me: 无 token 返回 401', async () => {
    const res = await request(BASE).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('请求体过大返回 413', async () => {
    const big = 'x'.repeat(70 * 1024)
    const res = await request(BASE)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 't', description: big, price: 1 })
    expect(res.status).toBe(413)
  })

  it('创建课程: 无 token 返回 401', async () => {
    const res = await request(BASE).post('/api/courses').send({ title: 'x', description: '', price: 1 })
    expect(res.status).toBe(401)
  })

  it('创建课程: 管理员可创建', async () => {
    const res = await request(BASE)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `集成测试课程 ${marker}`, description: 'desc', price: 5000, content: 'content' })
    expect(res.status).toBe(200)
    courseId = res.body.id
    expect(courseId).toBeGreaterThan(0)
  })

  it('创建库存为 0 的课程（用于库存不足测试）', async () => {
    const res = await request(BASE)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `无库存课程 ${marker}`, description: '', price: 100 })
    expect(res.status).toBe(200)
    zeroStockId = res.body.id
  })

  it('更新库存: 管理员设置库存为 1', async () => {
    const res = await request(BASE)
      .put(`/api/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 1 })
    expect(res.status).toBe(200)
    expect(res.body.stock).toBe(1)
  })

  it('课程列表包含新课程且未解锁', async () => {
    const res = await request(BASE).get('/api/courses')
    expect(res.status).toBe(200)
    const found = res.body.find((c: any) => c.id === courseId)
    expect(found).toBeTruthy()
    expect(found.unlocked).toBe(false)
  })

  it('下单: 库存为 0 返回 400', async () => {
    const res = await request(BASE).post('/api/checkout').send({ id: zeroStockId, channel: 'mock' })
    expect(res.status).toBe(400)
  })

  it('下单: mock 渠道返回 orderId 与 codeUrl', async () => {
    const res = await request(BASE).post('/api/checkout').send({ id: courseId, channel: 'mock' })
    expect(res.status).toBe(200)
    expect(res.body.orderId).toBeTruthy()
    expect(res.body.channel).toBe('mock')
    expect(res.body.real).toBe(false)
    expect(res.body.codeUrl).toContain('/mock-pay?')
    orderId = res.body.orderId
  })

  it('webhook: 回调金额与订单不符返回 400，且不落库、state key 被释放', async () => {
    await request(BASE)
      .put(`/api/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 2 })
    const badOrder = (await request(BASE).post('/api/checkout').send({ id: courseId, channel: 'mock' })).body.orderId
    const wrongBody = JSON.stringify({ out_trade_no: badOrder, transaction_id: `txn_${badOrder}`, amount: 1 })
    const sig = mockProvider.signCallback(wrongBody)
    const res = await request(BASE)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pay-channel', 'mock')
      .set('wechatpay-timestamp', sig.timestamp)
      .set('wechatpay-nonce', sig.nonce)
      .set('wechatpay-signature', sig.signature)
      .send(wrongBody)
    expect(res.status).toBe(400)
    expect(await redis.get(`order:${badOrder}:state`)).toBeNull()
    const [orderRows] = await db.query('SELECT id FROM orders WHERE order_id = ?', [badOrder])
    expect((orderRows as any[]).length).toBe(0)
    try { await redis.del(`order:${badOrder}:state`, `order:${badOrder}`) } catch {}
  })

  it('webhook: 错误签名返回 401', async () => {
    const res = await request(BASE)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pay-channel', 'mock')
      .set('wechatpay-timestamp', '1')
      .set('wechatpay-nonce', 'n')
      .set('wechatpay-signature', 'deadbeef')
      .send(JSON.stringify({ out_trade_no: 'none', amount: 1 }))
    expect(res.status).toBe(401)
  })

  it('webhook: mock 签名回调记录支付', async () => {
    rawBody = JSON.stringify({ out_trade_no: orderId, transaction_id: `txn_${orderId}`, amount: 500000 })
    const sig = mockProvider.signCallback(rawBody)
    const res = await request(BASE)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pay-channel', 'mock')
      .set('wechatpay-timestamp', sig.timestamp)
      .set('wechatpay-nonce', sig.nonce)
      .set('wechatpay-signature', sig.signature)
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
    expect(res.body.duplicate).toBeUndefined()
    expect(res.body.channel).toBe('mock')
  })

  it('webhook: 重复回调幂等', async () => {
    const sig = mockProvider.signCallback(rawBody)
    const res = await request(BASE)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pay-channel', 'mock')
      .set('wechatpay-timestamp', sig.timestamp)
      .set('wechatpay-nonce', sig.nonce)
      .set('wechatpay-signature', sig.signature)
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(res.body.duplicate).toBe(true)
  })

  it('订单状态: 已支付', async () => {
    const res = await request(BASE).get(`/api/order-status?orderId=${orderId}`)
    expect(res.status).toBe(200)
    expect(res.body.paid).toBe(true)
  })

  it('课程列表: 携带订单号后解锁', async () => {
    const res = await request(BASE).get('/api/courses').set('x-order-ids', orderId)
    expect(res.status).toBe(200)
    const found = res.body.find((c: any) => c.id === courseId)
    expect(found).toBeTruthy()
    expect(found.unlocked).toBe(true)
  })

  it('创建辅助课程（用于下架/批量测试）', async () => {
    const res = await request(BASE)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `批量测试课程 ${marker}`, description: '', price: 2000 })
    expect(res.status).toBe(200)
    auxId = res.body.id
    expect(auxId).toBeGreaterThan(0)
  })

  it('下架课程: 列表隐藏且不可购买', async () => {
    const off = await request(BASE)
      .put(`/api/courses/${auxId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ onSale: false })
    expect(off.status).toBe(200)
    expect(off.body.onSale).toBe(false)

    const list = await request(BASE).get('/api/courses')
    expect(list.body.find((c: any) => c.id === auxId)).toBeFalsy()

    const buy = await request(BASE).post('/api/checkout').send({ id: auxId, channel: 'mock' })
    expect(buy.status).toBe(400)
  })

  it('批量下架/上架生效', async () => {
    const off = await request(BASE)
      .post('/api/admin/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [auxId], action: 'offSale' })
    expect(off.status).toBe(200)

    const on = await request(BASE)
      .post('/api/admin/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [auxId], action: 'onSale' })
    expect(on.status).toBe(200)

    const list = await request(BASE).get('/api/courses')
    expect(list.body.find((c: any) => c.id === auxId)).toBeTruthy()
  })

  it('批量删除: 有订单的课程被拒绝', async () => {
    const res = await request(BASE)
      .post('/api/admin/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [courseId], action: 'delete' })
    expect(res.status).toBe(409)
  })

  it('批量删除: 无订单的课程成功', async () => {
    const res = await request(BASE)
      .post('/api/admin/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [auxId], action: 'delete' })
    expect(res.status).toBe(200)
    expect(res.body.affected).toBe(1)
  })

  it('mock-sign: 开发环境无需登录即可签名（本地联调）', async () => {
    const res = await request(BASE)
      .post('/api/mock-sign')
      .set('Content-Type', 'application/json')
      .send({ rawBody: '{"out_trade_no":"x"}', channel: 'mock' })
    expect(res.status).toBe(200)
    expect(res.body.signature).toBeTruthy()
  })

  it('登录: 超过限流阈值返回 429', async () => {
    try { await redis.del('ratelimit:login:::ffff:127.0.0.1') } catch {}
    let lastStatus = 0
    for (let i = 0; i < 8; i++) {
      const res = await request(BASE)
        .post('/api/auth/login')
        .send({ username: env.ADMIN_USER, password: env.ADMIN_PASS })
      lastStatus = res.status
    }
    expect(lastStatus).toBe(429)
    try { await redis.del('ratelimit:login:::ffff:127.0.0.1') } catch {}
  })
})
