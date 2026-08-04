<script setup lang="ts">
import { safeRedirect } from '~/utils/redirect'
const { customerLogin } = useAuth()
const route = useRoute()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await customerLogin(username.value.trim(), password.value)
    await navigateTo(safeRedirect(route.query.redirect, '/'), { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.data?.statusMessage || '登录失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <UiCard class="auth-card">
      <h1 class="auth-title">用户登录</h1>
      <p class="auth-subtitle">登录后购买并解锁课程</p>
      <form @submit.prevent="submit">
        <UiInput v-model="username" label="用户名" placeholder="3-20 位字母/数字/下划线" autocomplete="username" />
        <UiInput v-model="password" label="密码" type="password" placeholder="至少 8 位" autocomplete="current-password" />
        <div v-if="error" class="auth-error">{{ error }}</div>
        <UiButton type="submit" block :loading="submitting" :disabled="submitting">
          {{ submitting ? '登录中...' : '登录' }}
        </UiButton>
      </form>
      <div class="auth-footer">
        <NuxtLink to="/register">还没有账号？去注册</NuxtLink>
        <span class="auth-sep">|</span>
        <NuxtLink to="/login">管理员入口</NuxtLink>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.auth-page { max-width: 420px; margin: 0 auto; padding: var(--space-16) var(--space-6); }
.auth-card { padding: var(--space-8); }
.auth-title { margin: 0 0 var(--space-2); font-size: var(--fs-2xl); font-weight: 700; }
.auth-subtitle { margin: 0 0 var(--space-6); color: var(--color-text-secondary); }
.auth-card form { display: flex; flex-direction: column; gap: var(--space-5); }
.auth-error { color: var(--color-danger); font-size: var(--fs-sm); }
.auth-footer { margin-top: var(--space-6); text-align: center; font-size: var(--fs-sm); color: var(--color-text-secondary); }
.auth-footer a { color: var(--color-primary); text-decoration: none; }
.auth-sep { margin: 0 var(--space-2); color: var(--color-text-muted); }
</style>
