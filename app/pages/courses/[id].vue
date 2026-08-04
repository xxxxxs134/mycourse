<script setup lang="ts">
const route = useRoute()
const course = ref(null as null | { id: number, title: string, description: string, price: number, content: string, unlocked: boolean, onSale: boolean, category?: string, cover?: string, sold?: number })
const courseError = ref('')
const buying = ref(false)
const payment = ref(null as null | { orderId: string, codeUrl: string, channel: string, real: boolean, amount_cent: number })
const channel = ref('wechat')
const simulateError = ref('')

const channelOptions = [
  { id: 'wechat', label: '微信支付', desc: '国内用户' },
  { id: 'stripe', label: 'Stripe', desc: '海外用户（测试）' },
  { id: 'mock', label: '模拟支付', desc: '本地开发测试' },
]

let polling: ReturnType<typeof setInterval> | null = null
let pollCount = 0
const MAX_POLL_COUNT = 60

async function loadCourse() {
  courseError.value = ''
  stopPolling()
  payment.value = null
  simulateError.value = ''
  try {
    const data = await $fetch<{ id: number; title: string; description: string; price: number; content: string; unlocked: boolean; onSale: boolean; category?: string; cover?: string; sold?: number } | null>(
      '/api/courses/' + route.params.id,
      { credentials: 'include' }
    )
    course.value = data
    if (!data) courseError.value = '课程不存在或已下架'
  } catch (e: any) {
    courseError.value = e?.data?.message || e?.data?.statusMessage || '加载课程失败，请重试'
  }
}

watch(() => route.params.id, loadCourse, { immediate: true })

async function buy() {
  if (!course.value) return
  buying.value = true
  try {
    payment.value = await $fetch<{ orderId: string, codeUrl: string, channel: string, real: boolean, amount_cent: number }>('/api/checkout' as string, {
      method: 'POST',
      body: { id: course.value.id, title: course.value.title, price: course.value.price, channel: channel.value }
    })
    startPolling()
  } catch (e: any) {
    courseError.value = e?.data?.message || e?.data?.statusMessage || '下单失败，请重试'
  } finally {
    buying.value = false
  }
}

function stopPolling() {
  if (polling) {
    clearInterval(polling)
    polling = null
  }
}

function startPolling() {
  stopPolling()
  pollCount = 0
  polling = setInterval(async () => {
    if (!payment.value) return
    pollCount++
    if (pollCount > MAX_POLL_COUNT) {
      stopPolling()
      return
    }
    try {
      const { paid } = await $fetch(`/api/order-status?orderId=${payment.value.orderId}`)
      if (paid) {
        stopPolling()
        window.location.href = '/success'
      }
    } catch (e: any) {
      // 401/404：订单异常或会话失效，停止轮询避免重复触发全局跳转/无效请求
      const status = e?.response?.status ?? e?.statusCode
      if (status === 401 || status === 404 || status === 400) {
        stopPolling()
        return
      }
      // 其余网络抖动：继续轮询，直到达到上限
    }
  }, 2000)
}

async function simulatePay() {
  if (!payment.value) return
  simulateError.value = ''
  try {
    const rawBody = JSON.stringify({ out_trade_no: payment.value.orderId, amount: payment.value.amount_cent })
    const { timestamp, nonce, signature } = await $fetch<{ timestamp: string, nonce: string, signature: string }>('/api/mock-sign' as string, {
      method: 'POST',
      body: { rawBody, channel: payment.value.channel }
    })
    await $fetch<void>('/api/webhook' as string, {
      method: 'POST',
      body: rawBody,
      headers: {
        'content-type': 'text/plain',
        'x-pay-channel': payment.value.channel,
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signature
      }
    })
  } catch (e: any) {
    simulateError.value = e?.data?.message || e?.data?.statusMessage || '模拟支付失败，请重试'
  }
}

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div v-if="course" class="page">
    <NuxtLink to="/" class="back">← 返回课程列表</NuxtLink>

    <div class="layout">
      <div class="main">
        <div v-if="course.cover" class="main__banner">
          <img v-if="course.cover.startsWith('http')" :src="course.cover" :alt="course.title" class="main__banner-img">
          <span v-else class="main__banner-emoji">{{ course.cover }}</span>
        </div>
        <div class="main__head">
          <h1 class="main__title">{{ course.title }}</h1>
          <UiBadge :variant="course.unlocked ? 'success' : course.onSale ? 'neutral' : 'danger'">
            {{ course.unlocked ? '已解锁' : course.onSale ? '未解锁' : '已下架' }}
          </UiBadge>
        </div>
        <div v-if="course.category" class="main__cat">{{ course.category }}</div>
        <div v-if="(course.sold ?? 0) > 0" class="main__sold">{{ course.sold }} 人已购买</div>
        <p class="main__desc">{{ course.description }}</p>

        <div v-if="course.unlocked" class="content">
          <h2 class="content__heading">课程内容</h2>
          <div class="content__body">{{ course.content }}</div>
        </div>
      </div>

      <aside class="panel-wrap">
        <UiCard class="panel">
          <template v-if="course.unlocked">
            <p class="panel__price">已解锁</p>
            <p class="panel__hint">你可以随时回来复习这节课。</p>
          </template>

          <template v-else-if="payment">
            <p class="panel__price">¥{{ course.price }}</p>
            <div class="panel__qr">
              <PaymentQr :value="payment.codeUrl" />
            </div>
            <p class="panel__hint">
              {{ payment.real ? '请使用微信扫码完成支付' : '请使用对应支付方式扫码支付' }}
            </p>
            <p class="panel__hint panel__hint--muted">
              支付成功后页面将自动跳转，请勿关闭
            </p>
            <template v-if="!payment.real">
              <a :href="payment.codeUrl" target="_blank" class="panel__link">打开模拟支付页</a>
              <UiButton variant="outline" block class="panel__sim" @click="simulatePay">
                【模拟】支付成功
              </UiButton>
              <p v-if="simulateError" class="panel__error">{{ simulateError }}</p>
            </template>
          </template>

          <template v-else-if="!course.onSale">
            <p class="panel__price">¥{{ course.price }}</p>
            <p class="panel__hint">该课程已下架，暂不可购买。</p>
          </template>

          <template v-else>
            <div class="panel__summary">
              <span class="panel__summary-label">{{ course.title }}</span>
              <span class="panel__summary-price">¥{{ course.price }}</span>
            </div>
            <p class="panel__label">选择支付方式</p>
            <div class="panel__channels">
              <label
                v-for="opt in channelOptions"
                :key="opt.id"
                class="channel"
                :class="{ 'channel--active': channel === opt.id }"
              >
                <input v-model="channel" type="radio" :value="opt.id" class="channel__input">
                <span class="channel__name">{{ opt.label }}</span>
                <span class="channel__desc">{{ opt.desc }}</span>
              </label>
            </div>
            <UiButton :loading="buying" :disabled="buying" block size="lg" @click="buy">
              {{ buying ? '正在下单...' : '立即购买' }}
            </UiButton>
            <p v-if="(course.sold ?? 0) > 0" class="panel__sold">{{ course.sold }} 人已购买</p>
          </template>
        </UiCard>
      </aside>
    </div>
  </div>

  <div v-else-if="courseError" class="loading">
    <p class="error-text">{{ courseError }}</p>
    <NuxtLink to="/"><UiButton variant="outline">返回课程列表</UiButton></NuxtLink>
  </div>

  <div v-else class="loading">
    <UiSpinner />
    <p>加载中...</p>
  </div>
</template>

<style scoped>
.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-16);
}
.back {
  display: inline-block;
  margin-bottom: var(--space-6);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: var(--fs-sm);
}
.back:hover {
  color: var(--color-primary);
}

.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
}
@media (min-width: 1024px) {
  .layout {
    grid-template-columns: 1fr 340px;
    align-items: start;
  }
  .panel-wrap { position: sticky; top: var(--space-6); }
}

.main__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.main__title {
  margin: 0;
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--color-ink);
}
.main__banner {
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-5);
  aspect-ratio: 16 / 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary-subtle), #FECACA);
  border: 1px solid var(--color-border);
}
.main__banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.main__banner-emoji {
  font-size: 64px;
  line-height: 1;
}
.main__cat {
  display: inline-block;
  margin-top: var(--space-3);
  font-size: var(--fs-xs);
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-weight: 500;
}
.main__sold {
  margin-top: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
.main__desc {
  margin: var(--space-4) 0 0;
  font-size: var(--fs-lg);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.content {
  margin-top: var(--space-10);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-8);
}
.content__heading {
  margin: 0 0 var(--space-4);
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--color-ink);
}
.content__body {
  white-space: pre-wrap;
  line-height: 1.8;
  color: var(--color-ink);
}

.panel {
  padding: var(--space-6);
  box-shadow: var(--shadow-md);
}
.panel__price {
  margin: 0 0 var(--space-4);
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.panel__summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
.panel__summary-label {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel__summary-price {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--color-danger);
  white-space: nowrap;
}
.panel__sold {
  margin: var(--space-4) 0 0;
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}
.panel__label {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}
.panel__hint {
  margin: var(--space-3) 0;
  font-size: var(--fs-sm);
  color: var(--color-ink);
  line-height: 1.5;
}
.panel__hint--muted {
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
}
.panel__qr {
  display: flex;
  justify-content: center;
  padding: var(--space-4);
  background: var(--color-surface-subtle);
  border-radius: var(--radius-md);
}
.panel__link {
  display: inline-block;
  margin: var(--space-3) 0;
  color: var(--color-accent);
  font-size: var(--fs-sm);
}
.panel__sim {
  margin-top: var(--space-2);
}
.panel__error {
  margin-top: var(--space-3);
  color: var(--color-danger);
  font-size: var(--fs-sm);
}

.panel__channels {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.channel {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.channel--active {
  border-color: var(--color-primary);
  background-color: var(--color-primary-subtle);
}
.channel__input {
  accent-color: var(--color-primary);
  margin: 0;
}
.channel__name {
  font-weight: 500;
  color: var(--color-ink);
}
.channel__desc {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-16);
  color: var(--color-text-secondary);
}
.error-text {
  color: var(--color-danger);
  font-size: var(--fs-base);
}
</style>
