import mysql from 'mysql2/promise'
import {drizzle} from 'drizzle-orm/mysql2'
import Redis from 'ioredis'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'mycourse',
  password: process.env.DB_PASSWORD || 'mycourse_pass',
  database: process.env.DB_NAME || 'mycourse',
  timezone: 'Z'
})
export const db = drizzle(pool)

export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379
})
redis.on('error', (err) => {
  console.warn('[redis] 连接失败:', err.message)
})

export *from './schema'
export { eq, and, inArray, lt } from 'drizzle-orm'