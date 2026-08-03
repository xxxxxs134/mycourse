import { db, stockMovements, redis } from '../db'

export type MovementType = 'in' | 'out' | 'adjust' | 'sale' | 'release' | 'create'

/**
 * 记录一笔库存流水。beforeQty 从 Redis 权威库存读取（sale/release 场景由调用方
 * 传入精确值，避免在并发窗口内读到中间态）。
 */
export async function recordMovement(params: {
  courseId: number
  type: MovementType
  quantity: number
  remark?: string
  beforeQty?: number
}): Promise<void> {
  const before = params.beforeQty !== undefined ? params.beforeQty : Number(await redis.get(`stock:${params.courseId}`)) || 0
  const after = before + params.quantity
  await db.insert(stockMovements).values({
    courseId: params.courseId,
    type: params.type,
    quantity: params.quantity,
    beforeQty: before,
    afterQty: Math.max(after, 0),
    remark: params.remark || '',
    createdAt: new Date()
  })
}
