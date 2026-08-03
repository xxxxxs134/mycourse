import { redis } from '../db'

const CHECKOUT_STOCK_SCRIPT = `
-- KEYS[1] = stock:{courseId}
-- KEYS[2] = pending:{courseId}  (ZSET score=createdAtMs)
-- KEYS[3] = order:{orderId}     (HASH)
-- ARGV[1] = orderId
-- ARGV[2] = courseId
-- ARGV[3] = amount
-- ARGV[4] = channel
-- ARGV[5] = createdAtMs
-- ARGV[6] = orderHashTtl (秒)
-- returns: remain (>=0 ok), -1 sold out, -2 stock key missing (needs seed)

if redis.call('EXISTS', KEYS[1]) == 0 then
  return -2
end

local remain = redis.call('DECR', KEYS[1])
if remain < 0 then
  redis.call('INCR', KEYS[1])
  return -1
end

redis.call('HMSET', KEYS[3],
  'orderId', ARGV[1],
  'courseId', ARGV[2],
  'amount', ARGV[3],
  'channel', ARGV[4],
  'createdAt', ARGV[5]
)
redis.call('EXPIRE', KEYS[3], ARGV[6])
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[1])
return remain
`

const RELEASE_SCRIPT = `
-- KEYS[1] = pending:{courseId} (ZSET)
-- KEYS[2] = stock:{courseId}
-- KEYS[3] = order:{orderId}:state
-- KEYS[4] = order:{orderId}    (HASH)
-- ARGV[1] = orderId
-- ARGV[2] = stateKeyTTL
-- returns: 1 released, 0 skip(already released), -1 paid

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

export async function releasePendingOrder(courseId: number, orderId: string, stateKeyTtl: number): Promise<number> {
  return Number(await redis.eval(
    RELEASE_SCRIPT,
    4,
    `pending:${courseId}`,
    `stock:${courseId}`,
    `order:${orderId}:state`,
    `order:${orderId}`,
    orderId,
    String(stateKeyTtl)
  ))
}

export interface ReserveStockParams {
  courseId: number
  orderId: string
  amount: number
  channel: string
}

export interface PendingOrder {
  orderId: string
  courseId: number
  amount: number   // 单位：分（与微信回调 amount.total 一致）
  channel: string
  createdAt: number
}

export const ORDER_HASH_TTL_SEC = 86400

export async function reserveStock(params: ReserveStockParams): Promise<number> {
  const createdAt = Date.now()
  const remain = await redis.eval(
    CHECKOUT_STOCK_SCRIPT,
    3,
    `stock:${params.courseId}`,
    `pending:${params.courseId}`,
    `order:${params.orderId}`,
    params.orderId,
    String(params.courseId),
    String(params.amount),
    params.channel,
    String(createdAt),
    String(ORDER_HASH_TTL_SEC)
  )
  return Number(remain)
}

export async function getPendingOrder(orderId: string): Promise<PendingOrder | null> {
  const data = await redis.hgetall(`order:${orderId}`)
  if (!data || !data.orderId) return null
  return {
    orderId: data.orderId,
    courseId: Number(data.courseId),
    amount: Number(data.amount),
    channel: data.channel ?? '',
    createdAt: Number(data.createdAt),
  }
}

export async function orderExists(orderId: string): Promise<boolean> {
  return (await redis.exists(`order:${orderId}`)) === 1
}

export async function removePending(courseId: number, orderId: string): Promise<void> {
  await redis.zrem(`pending:${courseId}`, orderId)
}

export async function removeOrder(orderId: string): Promise<void> {
  await redis.del(`order:${orderId}`)
}

export async function listCoursePending(courseId: number): Promise<PendingOrder[]> {
  const ids = await redis.zrange(`pending:${courseId}`, 0, -1)
  if (ids.length === 0) return []
  const out: PendingOrder[] = []
  for (const id of ids) {
    const order = await getPendingOrder(id)
    if (order) out.push(order)
  }
  return out
}

export async function countAllPending(): Promise<number> {
  let total = 0
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'pending:*', 'COUNT', 200)
    cursor = next
    for (const key of keys) {
      total += await redis.zcard(key)
    }
  } while (cursor !== '0')
  return total
}

export async function listPendingCourseIds(): Promise<number[]> {
  const ids = new Set<number>()
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'pending:*', 'COUNT', 200)
    cursor = next
    for (const key of keys) {
      const id = Number(key.slice('pending:'.length))
      if (!Number.isNaN(id)) ids.add(id)
    }
  } while (cursor !== '0')
  return [...ids]
}

export async function listExpiredPending(courseId: number, cutoffMs: number): Promise<string[]> {
  return redis.zrangebyscore(`pending:${courseId}`, 0, cutoffMs)
}
