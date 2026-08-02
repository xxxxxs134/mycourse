<template>
  <div class="page">
    <div class="success">
      <div class="success__icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="success__title">支付成功！</h1>
      <p class="success__subtitle">感谢购买，课程马上解锁。</p>
      <NuxtLink to="/">
        <UiButton variant="primary" size="lg">返回课程列表</UiButton>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 420px;
  margin: 0 auto;
  padding: var(--space-16) var(--space-6);
}
.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-4);
}
.success__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  background-color: #F0FDF4;
  color: var(--color-success);
  margin-bottom: var(--space-2);
}
.success__icon svg {
  width: 36px;
  height: 36px;
}
.success__title {
  margin: 0;
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.success__subtitle {
  margin: 0 0 var(--space-4);
  color: var(--color-text-secondary);
}
</style>
