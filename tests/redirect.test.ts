import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../app/utils/redirect'

describe('safeRedirect', () => {
  it('站内路径通过', () => {
    expect(safeRedirect('/courses/1', '/')).toBe('/courses/1')
    expect(safeRedirect('/inventory', '/')).toBe('/inventory')
  })

  it('//evil.com 拒绝回 fallback', () => {
    expect(safeRedirect('//evil.com', '/')).toBe('/')
  })

  it('https://evil.com 拒绝回 fallback', () => {
    expect(safeRedirect('https://evil.com', '/')).toBe('/')
  })

  it('/\\evil.com 拒绝回 fallback', () => {
    expect(safeRedirect('/\\evil.com', '/')).toBe('/')
  })

  it('javascript: 拒绝回 fallback', () => {
    expect(safeRedirect('javascript:alert(1)', '/')).toBe('/')
  })

  it('控制符拒绝回 fallback', () => {
    expect(safeRedirect('/fo\no', '/')).toBe('/')
  })

  it('异常编码 %2F 拒绝回 fallback', () => {
    expect(safeRedirect('/%2Fevil.com', '/')).toBe('/')
  })

  it('空/缺省回 fallback', () => {
    expect(safeRedirect('', '/')).toBe('/')
    expect(safeRedirect(undefined, '/')).toBe('/')
  })
})
