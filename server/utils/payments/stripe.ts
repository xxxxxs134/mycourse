import { mockProvider, isProd, type PaymentProvider } from './mock'

export const stripeProvider: PaymentProvider = {
  ...mockProvider,
  id: 'stripe',
  label: 'Stripe（海外）',
  currency: 'USD',

  createPayment(params) {
    if (isProd()) {
      return Promise.reject(new Error('Stripe 未接入：生产环境不允许使用模拟支付'))
    }
    return mockProvider.createPayment({ ...params, channel: 'stripe' })
  },

  verifyCallback() {
    return !isProd()
  },
}
