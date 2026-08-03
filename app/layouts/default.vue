<script setup lang="ts">
const { isLoggedIn, isAdmin, authState, logout } = useAuth()

async function onLogout() {
  await logout()
  await navigateTo('/')
}
</script>

<template>
  <div class="site">
    <header class="site__nav">
      <div class="site__nav-inner">
        <NuxtLink to="/" class="site__brand">mycourse</NuxtLink>
        <nav class="site__links">
          <NuxtLink to="/" class="site__link">课程列表</NuxtLink>
          <template v-if="isAdmin">
            <NuxtLink to="/inventory" class="site__link">库存管理</NuxtLink>
            <NuxtLink to="/add" class="site__link">添加课程</NuxtLink>
          </template>
          <template v-if="isLoggedIn">
            <span class="site__link site__link--user">{{ authState.username || (isAdmin ? '管理员' : '用户') }}</span>
            <a class="site__link site__link--action" @click="onLogout">退出</a>
          </template>
          <template v-else>
            <NuxtLink to="/customer-login" class="site__link site__link--action">登录</NuxtLink>
            <NuxtLink to="/register" class="site__link site__link--action">注册</NuxtLink>
          </template>
        </nav>
      </div>
    </header>
    <main class="site__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.site__nav {
  background-color: var(--color-primary);
  position: sticky;
  top: 0;
  z-index: 10;
}
.site__nav-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.site__brand {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}
.site__links {
  display: flex;
  gap: var(--space-5);
}
.site__link {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color 0.15s ease, background-color 0.15s ease;
}
.site__link:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.15);
}
.site__link.router-link-active {
  color: #fff;
  font-weight: 600;
  background-color: rgba(255, 255, 255, 0.18);
}
.site__link--action {
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.site__link--user {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}
.site__main {
  min-height: 100vh;
}
</style>
