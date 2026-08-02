import { mockProvider, type PaymentProvider } from './mock'

export const stripeProvider: PaymentProvider = {
  ...mockProvider,
  id: 'stripe',
  label: 'Stripe（海外）',
  currency: 'USD',

  createPayment(params) {
    // TODO(real-api): 接入真实 Stripe Checkout
    //   调用 Stripe Checkout Session API（sk_test_xxx），
    //   返回 session.url 供海外用户跳转支付。
    //   上线前替换为真实实现，不要走 mock。
    return mockProvider.createPayment({ ...params, channel: 'stripe' })
  },}
