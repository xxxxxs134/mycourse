import { z } from 'zod'

const CoverSchema = z.string().max(255, '封面过长').refine((v) => {
  if (v === '') return true
  // 允许 http(s) URL
  if (/^https?:\/\//i.test(v)) return true
  // 明确拒绝 javascript:/data:/vbscript: 等可执行协议
  if (/^(javascript|data|vbscript):/i.test(v)) return false
  // 允许 emoji / 短文本（无控制符、无引号尖括号，防 XSS/注入）
  return /^[^\x00-\x1f"<>\u2028\u2029]{1,20}$/.test(v)
}, { message: '封面必须是 http(s) URL 或短文本/emoji' })

export const CourseCreateSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100),
  description: z.string().max(2000, '描述过长').default(''),
  price: z.number().int().min(0, '价格不能为负').max(10_000_000, '价格超出范围'),
  content: z.string().max(50000, '内容过长').default(''),
  category: z.string().max(50, '分类过长').default(''),
  cover: CoverSchema.default('')
})

export const CourseUpdateSchema = z.object({
  stock: z.number().int().min(0, '库存不能为负').optional(),
  onSale: z.boolean().optional(),
  title: z.string().min(1, '标题不能为空').max(100).optional(),
  price: z.number().int().min(0, '价格不能为负').optional(),
  category: z.string().max(50, '分类过长').optional(),
  cover: CoverSchema.optional()
}).refine((v) => Object.keys(v).length > 0, { message: '没有需要更新的字段' })

export const BatchActionSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择课程').max(200, '单次最多 200 个'),
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
    // 不向客户端暴露内部字段名/校验规则（防枚举与探测），详情入日志
    console.warn('[validate] 参数校验失败:', result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    throw createError({ statusCode: 400, message: '参数错误' })
  }
  return result.data
}