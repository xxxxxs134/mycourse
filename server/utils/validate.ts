import { z } from 'zod'

export const CourseCreateSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100),
  description: z.string().max(2000, '描述过长').default(''),
  price: z.number().int().min(0, '价格不能为负').max(10_000_000, '价格超出范围'),
  content: z.string().max(50000, '内容过长').default(''),
  category: z.string().max(50, '分类过长').default(''),
  cover: z.string().max(255, '封面过长').default('')
})

export const CourseUpdateSchema = z.object({
  stock: z.number().int().min(0, '库存不能为负').optional(),
  onSale: z.boolean().optional(),
  title: z.string().min(1, '标题不能为空').max(100).optional(),
  price: z.number().int().min(0, '价格不能为负').optional(),
  category: z.string().max(50, '分类过长').optional(),
  cover: z.string().max(255, '封面过长').optional()
}).refine((v) => Object.keys(v).length > 0, { message: '没有需要更新的字段' })

export const BatchActionSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择课程'),
  action: z.enum(['onSale', 'offSale', 'delete'])
})

export const StockAdjustSchema = z.object({
  courseId: z.number().int().positive(),
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.number().int().min(1, '数量必须为正整数'),
  remark: z.string().max(200, '备注过长').default('')
})

export const CheckoutSchema = z.object({
  id: z.number().int().positive(),
  channel: z.enum(['wechat', 'mock', 'stripe']).optional()
})

export const OrderStatusSchema = z.object({
  orderId: z.string().min(1)
})

export const MockSignSchema = z.object({
  rawBody: z.string().min(1),
  channel: z.enum(['wechat', 'mock', 'stripe']).optional()
})

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const first = result.error.issues[0]
    const message = first
      ? `${first.path.join('.')}: ${first.message}`
      : '参数校验失败'
    throw createError({ statusCode: 400, message })
}
return result.data
}