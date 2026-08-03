<script setup lang="ts">
const { isLoggedIn, logout } = useAuth()

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app">
    <header class="app__nav">
      <div class="app__nav-inner">
        <NuxtLink to="/" class="app__brand">mycourse</NuxtLink>
        <nav class="app__links">
          <NuxtLink to="/" class="app__link">课程列表</NuxtLink>
          <NuxtLink to="/inventory" class="app__link">库存管理</NuxtLink>
          <NuxtLink to="/add" class="app__link">添加课程</NuxtLink>
          <template v-if="isLoggedIn">
            <a class="app__link app__link--action" @click="onLogout">退出</a>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="app__link app__link--action">登录</NuxtLink>
          </template>
        </nav>
      </div>
    </header>
    <main class="app__main">
      <NuxtRouteAnnouncer />
      <NuxtPage />
    </main>
  </div>
</template>

<style>
.app__nav {
  background-color: var(--color-primary);
  position: sticky;
  top: 0;
  z-index: 10;
}
.app__nav-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.app__brand {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}
.app__links {
  display: flex;
  gap: var(--space-5);
}
.app__link {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color 0.15s ease, background-color 0.15s ease;
}
.app__link:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.15);
}
.app__link.router-link-active {
  color: #fff;
  font-weight: 600;
  background-color: rgba(255, 255, 255, 0.18);
}
.app__link--action {
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.app__main {
  min-height: 100vh;
}
</style>
