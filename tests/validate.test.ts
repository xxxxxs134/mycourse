import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const mockCreateError = vi.fn((opts: object) => ({ ...opts, name: 'H3Error' }))

let validate: typeof import('../server/utils/validate').validate
let schemas: typeof import('../server/utils/validate')

beforeAll(async () => {
  vi.stubGlobal('createError', mockCreateError)
  const mod = await import('../server/utils/validate')
  validate = mod.validate
  schemas = mod
})

afterEach(() => {
  mockCreateError.mockClear()
})

describe('validate', () => {
  it('通过合法数据返回解析结果', () => {
    const data = validate(schemas.CourseCreateSchema, { title: 'Vue 入门', price: 9900 })
    expect(data.title).toBe('Vue 入门')
    expect(data.price).toBe(9900)
    expect(data.description).toBe('')
    expect(mockCreateError).not.toHaveBeenCalled()
  })

  it('标题为空时抛 400', () => {
    expect(() => validate(schemas.CourseCreateSchema, { title: '', price: 1 })).toThrow()
    expect(mockCreateError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }))
  })

  it('价格为负时抛 400 且提示价格不能为负', () => {
    expect(() => validate(schemas.CourseCreateSchema, { title: 'ok', price: -1 })).toThrow()
    const arg = mockCreateError.mock.calls[0]?.[0] as { statusMessage?: string }
    expect(arg?.statusMessage).toContain('价格不能为负')
  })

  it('price 为小数时抛 400', () => {
    expect(() => validate(schemas.CourseCreateSchema, { title: 'ok', price: 10.5 })).toThrow()
    expect(mockCreateError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('CourseUpdateSchema', () => {
  it('stock 可为 0', () => {
    expect(schemas.CourseUpdateSchema.safeParse({ stock: 0 }).success).toBe(true)
  })

  it('stock 为负不通过', () => {
    expect(schemas.CourseUpdateSchema.safeParse({ stock: -1 }).success).toBe(false)
  })
})

describe('CheckoutSchema', () => {
  it('合法 id + 合法 channel', () => {
    expect(schemas.CheckoutSchema.safeParse({ id: 1, channel: 'wechat' }).success).toBe(true)
  })

  it('channel 缺省也合法', () => {
    expect(schemas.CheckoutSchema.safeParse({ id: 1 }).success).toBe(true)
  })

  it('非法 channel 不通过', () => {
    expect(schemas.CheckoutSchema.safeParse({ id: 1, channel: 'alipay' }).success).toBe(false)
  })

  it('id 为 0 不通过', () => {
    expect(schemas.CheckoutSchema.safeParse({ id: 0 }).success).toBe(false)
  })
})

describe('OrderStatusSchema', () => {
  it('空 orderId 不通过', () => {
    expect(schemas.OrderStatusSchema.safeParse({ orderId: '' }).success).toBe(false)
  })

  it('合法 orderId 通过', () => {
    expect(schemas.OrderStatusSchema.safeParse({ orderId: 'abc-123' }).success).toBe(true)
  })
})

describe('MockSignSchema', () => {
  it('空 rawBody 不通过', () => {
    expect(schemas.MockSignSchema.safeParse({ rawBody: '' }).success).toBe(false)
  })
})
