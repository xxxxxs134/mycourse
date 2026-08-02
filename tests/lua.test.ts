import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import Redis from 'ioredis'

const redis = new Redis('redis://127.0.0.1:6379/15')
const COURSE = 999900
const STOCK = 10

const CHECKOUT = `
local remain = redis.call('DECR', KEYS[1])
if remain < 0 then
  redis.call('INCR', KEYS[1])
  return -1
end
redis.call('HMSET', KEYS[3], 'orderId', ARGV[1], 'courseId', ARGV[2], 'amount', ARGV[3], 'channel', ARGV[4], 'createdAt', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[1])
return remain
`

const CHECKOUT_MISSING = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return -2
end
local remain = redis.call('DECR', KEYS[1])
if remain < 0 then
  redis.call('INCR', KEYS[1])
  return -1
end
redis.call('HMSET', KEYS[3], 'orderId', ARGV[1], 'courseId', ARGV[2], 'amount', ARGV[3], 'channel', ARGV[4], 'createdAt', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[1])
return remain
`

const RELEASE = `
local state = redis.call('GET', KEYS[3])
if state == 'PAID' then
  return -1
end
local ok = redis.call('SET', KEYS[3], 'RELEASED', 'EX', ARGV[2], 'NX')
if ok == nil then
  local s = redis.call('GET', KEYS[3])
  if s == 'PAID' then return -1 end
end
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
if removed == 0 then return 0 end
redis.call('INCR', KEYS[2])
redis.call('DEL', KEYS[4])
return 1
`

async function checkout(orderId: string, amount: number) {
  return Number(await redis.eval(
    CHECKOUT_MISSING,
    3,
    `stock:${COURSE}`,
    `pending:${COURSE}`,
    `order:${orderId}`,
    orderId,
    String(COURSE),
    String(amount),
    'mock',
    String(Date.now())
  ))
}

async function release(orderId: string) {
  return Number(await redis.eval(
    RELEASE,
    4,
    `pending:${COURSE}`,
    `stock:${COURSE}`,
    `order:${orderId}:state`,
    `order:${orderId}`,
    orderId,
    String(86400)
  ))
}

async function reset() {
  const ids = await redis.zrange(`pending:${COURSE}`, 0, -1)
  const keys = ids.flatMap((id) => [`order:${id}`, `order:${id}:state`])
  await redis.del(`stock:${COURSE}`, `pending:${COURSE}`, ...keys)
  await redis.set(`stock:${COURSE}`, String(STOCK))
}

beforeAll(() => redis.flushdb())
beforeEach(reset)
afterAll(async () => {
  await redis.flushdb()
  await redis.quit()
})

describe('Lua 库存脚本', () => {
  it('库存 key 缺失时返回 -2（需要先播种）', async () => {
    await redis.del(`stock:${COURSE}`)
    const res = await checkout('o-missing', 100)
    expect(res).toBe(-2)
    expect(await redis.exists(`stock:${COURSE}`)).toBe(0)
    expect(await redis.exists(`order:o-missing`)).toBe(0)
  })

  it('并发下单不超卖，成功数 = 库存', async () => {
    const results = await Promise.all(
      Array.from({ length: STOCK * 5 }, (_, i) => checkout(`o-conc-${i}`, 100))
    )
    const ok = results.filter((r) => r >= 0)
    const fail = results.filter((r) => r === -1)
    expect(ok.length).toBe(STOCK)
    expect(fail.length).toBe(STOCK * 4)
    expect(await redis.get(`stock:${COURSE}`)).toBe('0')
  })

  it('释放库存：state 为空 → RELEASED + 回补 + 清清单', async () => {
    await checkout('o-rel', 100)
    const stockBefore = Number(await redis.get(`stock:${COURSE}`))
    const res = await release('o-rel')
    expect(res).toBe(1)
    expect(Number(await redis.get(`stock:${COURSE}`))).toBe(stockBefore + 1)
    expect(await redis.zrank(`pending:${COURSE}`, 'o-rel')).toBeNull()
    expect(await redis.exists(`order:o-rel`)).toBe(0)
    expect(await redis.get(`order:o-rel:state`)).toBe('RELEASED')
  })

  it('重复释放：pending 已清 → 返回 0，不重复回补', async () => {
    await checkout('o-rel2', 100)
    await release('o-rel2')
    const stockBefore = Number(await redis.get(`stock:${COURSE}`))
    const res = await release('o-rel2')
    expect(res).toBe(0)
    expect(Number(await redis.get(`stock:${COURSE}`))).toBe(stockBefore)
  })

  it('已支付订单不可释放：state=PAID → 返回 -1', async () => {
    await checkout('o-paid', 100)
    await redis.set(`order:o-paid:state`, 'PAID', 'EX', 86400)
    const res = await release('o-paid')
    expect(res).toBe(-1)
    expect(await redis.zrank(`pending:${COURSE}`, 'o-paid')).not.toBeNull()
  })

  it('并发释放同一订单只回补一次', async () => {
    await checkout('o-race', 100)
    const stockBefore = Number(await redis.get(`stock:${COURSE}`))
    const results = await Promise.all(Array.from({ length: 20 }, () => release('o-race')))
    const releases = results.filter((r) => r === 1)
    expect(releases.length).toBe(1)
    expect(Number(await redis.get(`stock:${COURSE}`))).toBe(stockBefore + 1)
  })

  it('webhook 先抢 PAID 后，release 无法释放', async () => {
    await checkout('o-race2', 100)
    const paid = await redis.set(`order:o-race2:state`, 'PAID', 'EX', 86400, 'NX')
    expect(paid).toBe('OK')
    const res = await release('o-race2')
    expect(res).toBe(-1)
    expect(await redis.get(`stock:${COURSE}`)).toBe('9')
  })
})
