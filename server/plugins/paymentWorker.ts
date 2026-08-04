import { startPaymentWorker } from '../worker/paymentWorker'

// 支付确认 worker：消费 pay_queue 异步落库订单。
// 多实例安全：XREADGROUP 组消费天然保证每条消息只被一个 worker 处理。
export default defineNitroPlugin(() => {
  startPaymentWorker()
})
