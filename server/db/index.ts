import mysql from 'mysql2/promise'
import {drizzle} from 'drizzle-orm/mysql2'
import Redis from 'ioredis'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'mycourse',
  password: process.env.DB_PASSWORD || 'mycourse_pass',
  database: process.env.DB_NAME || 'mycourse',
  timezone: 'Z',
  connectionLimit: Math.min(Number(process.env.DB_POOL_SIZE) || 50, 50),
  queueLimit: Number(process.env.DB_POOL_QUEUE) || 1000
})
export const db = drizzle(pool)

export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
})
redis.on('error', (err) => {
  console.warn('[redis] 连接失败:', err.message)
})

// 独立连接供 worker 使用：XREADGROUP BLOCK 等阻塞命令会挂起同一连接上的后续
// 所有命令（Redis 服务端行为），若与接口共用主连接，worker 每 2s 的 BLOCK 会让
// 接口的缓存读排队最多 2s。队列/重放/接管等全部走 workerRedis，主连接只服务接口。
export const workerRedis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
})
workerRedis.on('error', (err) => {
  console.warn('[worker-redis] 连接失败:', err.message)
})

export *from './schema'
export { eq, and, inArray, lt } from 'drizzle-orm'