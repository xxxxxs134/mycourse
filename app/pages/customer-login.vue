<script setup lang="ts">
import { safeRedirect } from '~/utils/redirect'
const { customerLogin } = useAuth()
const route = useRoute()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

// 登录成功后的跳转目标（从详情页等带 redirect 进来时回原页面，否则回首页）
const backTarget = safeRedirect(route.query.redirect, '/')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await customerLogin(username.value.trim(), password.value)
    await navigateTo(backTarget, { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.data?.statusMessage || '登录失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <!-- 左：品牌宣传区 -->
      <div class="login-card__brand">
        <div class="login-card__logo">🎓</div>
        <h2 class="login-card__title">mycourse 在线课程</h2>
        <p class="login-card__slogan">精品课程 · 即买即学</p>
        <ul class="login-card__points">
          <li>覆盖多领域精品课程</li>
          <li>支付即解锁，随时回看</li>
          <li>课程内容持续更新</li>
        </ul>
      </div>

      <!-- 右：登录表单 -->
      <div class="login-card__form">
        <NuxtLink :to="backTarget" class="login-back">← 返回</NuxtLink>
        <h1 class="login-title">用户登录</h1>
        <p class="login-subtitle">登录后购买并解锁课程</p>
        <form @submit.prevent="submit">
          <UiInput v-model="username" label="用户名" placeholder="3-20 位字母/数字/下划线" autocomplete="username" />
          <UiInput v-model="password" label="密码" type="password" placeholder="至少 8 位" autocomplete="current-password" />
          <div v-if="error" class="login-error">{{ error }}</div>
          <UiButton type="submit" block :loading="submitting" :disabled="submitting">
            {{ submitting ? '登录中...' : '登 录' }}
          </UiButton>
        </form>
        <div class="login-footer">
          <NuxtLink :to="`/register?redirect=${encodeURIComponent(backTarget)}`">还没有账号？去注册</NuxtLink>
          <span class="login-sep">|</span>
          <NuxtLink to="/login">管理员入口</NuxtLink>
        </div>
        <p class="login-copy">© 2026 mycourse.com · 让学习更简单</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
  background:
    radial-gradient(1200px 400px at 50% -10%, #FDE8E7 0%, rgba(253, 232, 231, 0) 60%),
    #F5F6F8;
}

.login-card {
  display: flex;
  width: 100%;
  max-width: 880px;
  min-height: 420px;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* 左：品牌区（渐变红，白字） */
.login-card__brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-12) var(--space-10);
  color: #fff;
  background: linear-gradient(135deg, #E1251B 0%, #C81623 100%);
}
.login-card__logo {
  font-size: 56px;
  line-height: 1;
  margin-bottom: var(--space-5);
}
.login-card__title {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-2xl);
  font-weight: 700;
}
.login-card__slogan {
  margin: 0 0 var(--space-8);
  font-size: var(--fs-lg);
  opacity: 0.9;
}
.login-card__points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--fs-sm);
  opacity: 0.92;
}
.login-card__points li {
  padding-left: var(--space-5);
  position: relative;
}
.login-card__points li::before {
  content: '✓';
  position: absolute;
  left: 0;
  font-weight: 700;
}

/* 右：表单区 */
.login-card__form {
  width: 400px;
  padding: var(--space-10) var(--space-10) var(--space-8);
  position: relative;
}
.login-back {
  display: inline-block;
  margin-bottom: var(--space-6);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  text-decoration: none;
}
.login-back:hover {
  color: var(--color-primary);
}
.login-title {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.login-subtitle {
  margin: 0 0 var(--space-8);
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}
.login-card__form form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.login-error {
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
.login-footer {
  margin-top: var(--space-8);
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}
.login-footer a {
  color: var(--color-primary);
  text-decoration: none;
}
.login-sep {
  margin: 0 var(--space-2);
  color: var(--color-text-muted);
}
.login-copy {
  margin: var(--space-6) 0 0;
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .login-card__brand {
    display: none;
  }
  .login-card {
    max-width: 420px;
  }
  .login-card__form {
    width: 100%;
  }
}
</style>
