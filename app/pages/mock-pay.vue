<script setup lang="ts">
const route = useRoute()
const orderId = String(route.query.orderId || '')
const title = String(route.query.title || '未命名课程')
const amount = Number(route.query.amount || 0)
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
    const rawBody = JSON.stringify({ out_trade_no: orderId })
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
    error.value = e?.data?.statusMessage || '支付失败，请重试'
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="page">
    <UiCard class="pay">
      <h2 class="pay__title">{{ channelLabel }}</h2>
      <p class="pay__subtitle">Mock {{ channel }} · 仅本地测试</p>

      <p class="pay__course">{{ title }}</p>
      <p class="pay__amount">¥{{ (amount / 100).toFixed(2) }}</p>

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
.pay__course {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
}
.pay__amount {
  margin: 0 0 var(--space-8);
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--color-ink);
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
