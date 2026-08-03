import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (p: string | Buffer, s: string | Buffer, k: number) => Promise<Buffer>

const KEYLEN = 64
const SALT_LEN = 16

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('密码长度至少 8 位')
  }
  const salt = randomBytes(SALT_LEN)
  const derived = await scrypt(password, salt, KEYLEN)
  // 格式: saltHex:hashHex
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const sep = stored.indexOf(':')
  if (sep < 0) {
    // 存储格式无效：跑一次 scrypt 平衡耗时（防时序枚举），然后返回 false
    const dummySalt = randomBytes(SALT_LEN)
    await scrypt(password, dummySalt, KEYLEN)
    return false
  }
  const saltHex = stored.slice(0, sep)
  const hashHex = stored.slice(sep + 1)
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (salt.length === 0 || expected.length === 0) {
    const dummySalt = randomBytes(SALT_LEN)
    await scrypt(password, dummySalt, KEYLEN)
    return false
  }
  const derived = await scrypt(password, salt, KEYLEN)
  // 恒定时间比较，防时序攻击
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}
