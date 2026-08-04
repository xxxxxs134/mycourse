<script setup lang="ts">
const route = useRoute()
const orderId = String(route.query.orderId || '')
const title = String(route.query.title || '未命名课程')
const rawAmount = Number(route.query.amount)
const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0
const channel = String(route.query.channel || 'wechat')

const channelLabels: Record<string, string> = {
  mock: '模拟支付',
  wechat: '微信支付',
  stripe: 'Stripe',
}
const channelLabel = channelLabels[channel] || channel

const paying = ref(false)
const done = ref(false)
const error = ref('')

async function pay() {
  paying.value = true
  error.value = ''
  try {
    const rawBody = JSON.stringify({
  out_trade_no: orderId,
  transaction_id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  amount
})
    const { timestamp, nonce, signature } = await $fetch('/api/mock-sign', {
      method: 'POST',
      body: { rawBody, channel }
    })
    await $fetch('/api/webhook', {
      method: 'POST',
      body: rawBody,
      headers: {
        'content-type': 'text/plain',
        'x-pay-channel': channel,
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signature
      }
    })
    done.value = true
    setTimeout(() => { window.location.href = '/success' }, 1500)
  } catch (e: any) {
    error.value = e?.data?.message || e?.data?.statusMessage || '支付失败，请重试'
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="page">
    <UiCard class="pay">
      <h2 class="pay__title">确认支付</h2>
      <p class="pay__subtitle">{{ channelLabel }} · 模拟环境</p>

      <div class="pay__summary">
        <div class="pay__row">
          <span class="pay__row-label">商品</span>
          <span class="pay__row-value">{{ title }}</span>
        </div>
        <div class="pay__row">
          <span class="pay__row-label">金额</span>
          <span class="pay__row-value pay__row-value--price">¥{{ (amount / 100).toFixed(2) }}</span>
        </div>
      </div>

      <UiButton v-if="!done" :loading="paying" :disabled="paying" block size="lg" @click="pay">
        {{ paying ? '支付中...' : '确认支付' }}
      </UiButton>

      <div v-if="done" class="pay__done">支付成功，正在跳转...</div>
      <div v-if="error" class="pay__error">{{ error }}</div>

      <NuxtLink to="/" class="pay__back">返回课程列表</NuxtLink>
    </UiCard>
  </div>
</template>

<style scoped>
.page {
  max-width: 420px;
  margin: 0 auto;
  padding: var(--space-12) var(--space-6);
}
.pay {
  padding: var(--space-8);
  text-align: center;
  box-shadow: var(--shadow-md);
}
.pay__title {
  margin: 0;
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.pay__subtitle {
  margin: var(--space-2) 0 var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
}
.pay__summary {
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.pay__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}
.pay__row-label {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.pay__row-value {
  font-size: var(--fs-base);
  color: var(--color-ink);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pay__row-value--price {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--color-danger);
}
.pay__done {
  margin-top: var(--space-4);
  color: var(--color-primary);
  font-size: var(--fs-lg);
  font-weight: 500;
}
.pay__error {
  margin-top: var(--space-4);
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
.pay__back {
  display: inline-block;
  margin-top: var(--space-5);
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
  text-decoration: none;
}
.pay__back:hover {
  color: var(--color-primary);
}
</style>
