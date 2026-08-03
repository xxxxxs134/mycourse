import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../server/utils/password'

describe('password', () => {
  it('哈希后可验证正确密码', async () => {
    const stored = await hashPassword('password123')
    expect(await verifyPassword('password123', stored)).toBe(true)
  })

  it('错误密码验证失败', async () => {
    const stored = await hashPassword('password123')
    expect(await verifyPassword('wrongpass', stored)).toBe(false)
  })

  it('每次哈希 salt 不同（同密码不同存储值）', async () => {
    const a = await hashPassword('password123')
    const b = await hashPassword('password123')
    expect(a).not.toBe(b)
  })

  it('密码少于 8 位抛错', async () => {
    await expect(hashPassword('short')).rejects.toThrow()
  })

  it('损坏的存储值返回 false 而不抛错', async () => {
    expect(await verifyPassword('password123', 'garbage')).toBe(false)
    expect(await verifyPassword('password123', '')).toBe(false)
    expect(await verifyPassword('password123', ':')).toBe(false)
  })
})
