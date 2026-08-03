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
  let customerToken = ''
  let customerToken2 = ''
  let customerUid = 0
  let customer2Uid = 0
  let courseId = 0
  let catCourseId = 0
  let zeroStockId = 0
  let auxId = 0
  let orderId = ''
  let rawBody = ''
  const marker = `e2e-${Date.now()}`
  const customer1Name = `cust1_${Date.now()}`
  const customer2Name = `cust2_${Date.now()}`


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
    try { await redis.del('ratelimit:login:::ffff:127.0.0.1', 'ratelimit:register:::ffff:127.0.0.1', 'ratelimit:customer-login:::ffff:127.0.0.1') } catch {}
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
      if (catCourseId) { try { await redis.del(`stock:${catCourseId}`) } catch {} }
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
      if (courseId || zeroStockId || auxId || catCourseId) {
        const ids = [courseId, zeroStockId, auxId, catCourseId].filter(Boolean)
        const ph = ids.map(() => '?').join(',')
        try { await db.query(`DELETE FROM stock_movements WHERE course_id IN (${ph})`, ids) } catch {}
        try { await db.query(`DELETE FROM courses WHERE id IN (${ph})`, ids) } catch {}
      }
      if (customer1Name || customer2Name) {
        try { await db.query('DELETE FROM users WHERE username IN (?, ?)', [customer1Name, customer2Name]) } catch {}
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

  it('注册: 格式非法返回 400', async () => {
    const res = await request(BASE)
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'password123' })
    expect(res.status).toBe(400)
  })

  it('注册: 短密码返回 400', async () => {
    const res = await request(BASE)
      .post('/api/auth/register')
      .send({ username: customer1Name, password: 'short' })
    expect(res.status).toBe(400)
  })

  it('注册: 客户1 成功', async () => {
    const res = await request(BASE)
      .post('/api/auth/register')
      .send({ username: customer1Name, password: 'password123', nickname: '买家一号' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.uid).toBeGreaterThan(0)
    customerToken = res.body.token
    customerUid = res.body.uid
  })

  it('注册: 重复用户名返回 409', async () => {
    const res = await request(BASE)
      .post('/api/auth/register')
      .send({ username: customer1Name, password: 'password123' })
    expect(res.status).toBe(409)
  })

  it('注册: 客户2 成功（用于防越权测试）', async () => {
    const res = await request(BASE)
      .post('/api/auth/register')
      .send({ username: customer2Name, password: 'password123' })
    expect(res.status).toBe(200)
    customerToken2 = res.body.token
    customer2Uid = res.body.uid
  })

  it('客户登录: 密码错误返回 401', async () => {
    const res = await request(BASE)
      .post('/api/auth/customer-login')
      .send({ username: customer1Name, password: 'wrongpass' })
    expect(res.status).toBe(401)
  })

  it('客户登录: 正确凭据返回 token', async () => {
    const res = await request(BASE)
      .post('/api/auth/customer-login')
      .send({ username: customer1Name, password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    customerToken = res.body.token
  })

  it('客户登录: 防枚举——密码错误与用户不存在返回完全一致', async () => {
    const wrongPwd = await request(BASE)
      .post('/api/auth/customer-login')
      .send({ username: customer1Name, password: 'wrong-pass-xyz' })
    const noUser = await request(BASE)
      .post('/api/auth/customer-login')
      .send({ username: 'definitely_no_such_user', password: 'wrong-pass-xyz' })
    expect(wrongPwd.status).toBe(401)
    expect(noUser.status).toBe(401)
    expect(wrongPwd.body).toEqual(noUser.body)
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

  it('创建课程: 支持 category 和 cover 字段', async () => {
    const res = await request(BASE)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `分类课程 ${marker}`, description: '', price: 100, category: '前端', cover: '🚀' })
    expect(res.status).toBe(200)
    catCourseId = res.body.id
  })

  it('课程列表: 返回 category 和 cover', async () => {
    const res = await request(BASE).get('/api/courses')
    expect(res.status).toBe(200)
    const found = res.body.find((c: any) => c.id === catCourseId)
    expect(found).toBeTruthy()
    expect(found.category).toBe('前端')
    expect(found.cover).toBe('🚀')
  })

  it('课程列表: 按分类筛选', async () => {
    const res = await request(BASE).get('/api/courses?category=前端')
    expect(res.status).toBe(200)
    expect(res.body.some((c: any) => c.id === catCourseId)).toBe(true)
    expect(res.body.every((c: any) => c.category === '前端')).toBe(true)
  })

  it('库存调整: 入库增加库存并记流水', async () => {
    const res = await request(BASE)
      .post('/api/stock/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ courseId, type: 'in', quantity: 10, remark: '测试入库' })
    expect(res.status).toBe(200)
    expect(res.body.after).toBe(11)
    expect(res.body.before).toBe(1)
  })

  it('库存调整: 出库超过库存返回 400', async () => {
    const res = await request(BASE)
      .post('/api/stock/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ courseId, type: 'out', quantity: 99999 })
    expect(res.status).toBe(400)
  })

  it('库存调整: 未登录返回 401', async () => {
    const res = await request(BASE)
      .post('/api/stock/adjust')
      .send({ courseId, type: 'in', quantity: 1 })
    expect(res.status).toBe(401)
  })

  it('库存流水: 列表返回入库记录', async () => {
    const res = await request(BASE)
      .get('/api/stock/movements')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThan(0)
    const found = res.body.items.find((m: any) => m.courseId === courseId && m.type === 'in')
    expect(found).toBeTruthy()
    expect(found.quantity).toBe(10)
    expect(found.afterQty).toBe(11)
  })

  it('库存流水: 未登录返回 401', async () => {
    const res = await request(BASE).get('/api/stock/movements')
    expect(res.status).toBe(401)
  })

  it('库存汇总: 返回统计', async () => {
    const res = await request(BASE)
      .get('/api/stock/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.totalCourses).toBeGreaterThan(0)
    expect(typeof res.body.totalIn).toBe('number')
    expect(typeof res.body.totalOut).toBe('number')
  })

  it('课程列表包含新课程且未解锁', async () => {
    const res = await request(BASE).get('/api/courses')
    expect(res.status).toBe(200)
    const found = res.body.find((c: any) => c.id === courseId)
    expect(found).toBeTruthy()
    expect(found.unlocked).toBe(false)
  })

  it('下单: 库存为 0 返回 410', async () => {
    const res = await request(BASE).post('/api/checkout').set('Authorization', `Bearer ${customerToken}`).send({ id: zeroStockId, channel: 'mock' })
    expect(res.status).toBe(410)
  })

  it('下单: mock 渠道返回 orderId 与 codeUrl', async () => {
    const res = await request(BASE).post('/api/checkout').set('Authorization', `Bearer ${customerToken}`).send({ id: courseId, channel: 'mock' })
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
    const badOrder = (await request(BASE).post('/api/checkout').set('Authorization', `Bearer ${customerToken}`).send({ id: courseId, channel: 'mock' })).body.orderId
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

  it('课程列表: 客户1 登录后已解锁', async () => {
    const res = await request(BASE).get('/api/courses').set('Authorization', `Bearer ${customerToken}`)
    expect(res.status).toBe(200)
    const found = res.body.find((c: any) => c.id === courseId)
    expect(found).toBeTruthy()
    expect(found.unlocked).toBe(true)
  })

  it('课程详情: 客户1 登录后可看到正文', async () => {
    const res = await request(BASE).get(`/api/courses/${courseId}`).set('Authorization', `Bearer ${customerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.unlocked).toBe(true)
    expect(res.body.content).toBe('content')
  })

  it('防越权: 客户2 访问同一课程不解锁', async () => {
    const res = await request(BASE).get(`/api/courses/${courseId}`).set('Authorization', `Bearer ${customerToken2}`)
    expect(res.status).toBe(200)
    expect(res.body.unlocked).toBe(false)
    expect(res.body.content).toBe('')
  })

  it('未登录: 访问课程详情不解锁、看不到正文', async () => {
    const res = await request(BASE).get(`/api/courses/${courseId}`)
    expect(res.status).toBe(200)
    expect(res.body.unlocked).toBe(false)
    expect(res.body.content).toBe('')
  })

  it('下单: 未登录返回 401', async () => {
    const res = await request(BASE).post('/api/checkout').send({ id: courseId, channel: 'mock' })
    expect(res.status).toBe(401)
  })

  it('下单: admin token 不能当客户用，返回 403（角色隔离）', async () => {
    const res = await request(BASE)
      .post('/api/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: courseId, channel: 'mock' })
    expect(res.status).toBe(403)
  })

  it('admin 不能访问客户接口的身份：/api/auth/me 返回 admin', async () => {
    const res = await request(BASE).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('admin')
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

    const buy = await request(BASE).post('/api/checkout').set('Authorization', `Bearer ${customerToken}`).send({ id: auxId, channel: 'mock' })
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
