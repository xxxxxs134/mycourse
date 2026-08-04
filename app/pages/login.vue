<script setup lang="ts">
import { safeRedirect } from '~/utils/redirect'
const route = useRoute()
const { login, isLoggedIn } = useAuth()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

if (isLoggedIn.value) {
  navigateTo(safeRedirect(route.query.redirect, '/inventory'), { replace: true })
}

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await login(username.value.trim(), password.value)
    navigateTo(safeRedirect(route.query.redirect, '/inventory'), { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.data?.statusMessage || '登录失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <UiCard class="login__card">
      <div class="login__head">
        <h1 class="login__title">管理员登录</h1>
        <p class="login__subtitle">登录后管理课程与库存</p>
      </div>

      <form @submit.prevent="submit">
        <UiInput v-model="username" label="用户名" placeholder="请输入用户名" autocomplete="username" required />
        <UiInput v-model="password" label="密码" type="password" placeholder="请输入密码" autocomplete="current-password" required />

        <div v-if="error" class="login__error">{{ error }}</div>

        <UiButton type="submit" block :loading="submitting" :disabled="submitting">
          {{ submitting ? '登录中...' : '登录' }}
        </UiButton>
      </form>

      <div class="login__back">
        <NuxtLink to="/">← 返回课程列表</NuxtLink>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.login {
  max-width: 420px;
  margin: 0 auto;
  padding: var(--space-16) var(--space-6);
}
.login__card {
  padding: var(--space-8);
}
.login__head {
  margin-bottom: var(--space-6);
}
.login__title {
  margin: 0;
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.login__subtitle {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--fs-sm);
}
.login form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.login__error {
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
.login__back {
  margin-top: var(--space-6);
  text-align: center;
  font-size: var(--fs-sm);
}
.login__back a {
  color: var(--color-text-secondary);
  text-decoration: none;
}
.login__back a:hover {
  color: var(--color-primary);
}
</style>
