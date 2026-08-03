<script setup lang="ts">
const { register } = useAuth()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const nickname = ref('')
const submitting = ref(false)
const error = ref('')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致'
      return
    }
    await register(username.value.trim(), password.value, nickname.value.trim() || undefined)
    await navigateTo('/', { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.data?.statusMessage || '注册失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <UiCard class="auth-card">
      <h1 class="auth-title">注册账号</h1>
      <p class="auth-subtitle">创建账号后即可购买课程</p>
      <form @submit.prevent="submit">
        <UiInput v-model="username" label="用户名" placeholder="3-20 位字母/数字/下划线" autocomplete="username" />
        <UiInput v-model="nickname" label="昵称（可选）" placeholder="展示用昵称" />
        <UiInput v-model="password" label="密码" type="password" placeholder="至少 8 位" autocomplete="new-password" />
        <UiInput v-model="confirmPassword" label="确认密码" type="password" placeholder="再次输入密码" autocomplete="new-password" />
        <div v-if="error" class="auth-error">{{ error }}</div>
        <UiButton type="submit" block :loading="submitting" :disabled="submitting">
          {{ submitting ? '注册中...' : '注册' }}
        </UiButton>
      </form>
      <div class="auth-footer">
        <NuxtLink to="/customer-login">已有账号？去登录</NuxtLink>
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
.auth-footer { margin-top: var(--space-6); text-align: center; font-size: var(--fs-sm); }
.auth-footer a { color: var(--color-primary); text-decoration: none; }
</style>
