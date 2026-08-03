<script setup lang="ts">
const { isAdmin, authState, logout } = useAuth()

onMounted(async () => {
  const { checkAuth } = useAuth()
  await checkAuth()
  if (!isAdmin.value) {
    await navigateTo('/login')
  }
})

async function onLogout() {
  await logout()
  await navigateTo('/login')
}

const navItems = [
  { to: '/inventory', label: '商品管理', icon: '📦' },
  { to: '/stock-movements', label: '库存流水', icon: '🔄' },
  { to: '/add', label: '添加商品', icon: '➕' },
]
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <NuxtLink to="/" class="admin-brand">
        <span class="admin-brand__logo">MC</span>
        <span class="admin-brand__name">mycourse 后台</span>
      </NuxtLink>
      <nav class="admin-menu">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-menu__item"
          active-class="admin-menu__item--active"
        >
          <span class="admin-menu__icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
      <div class="admin-sidebar__foot">
        <NuxtLink to="/" class="admin-sidebar__link">← 返回商城</NuxtLink>
      </div>
    </aside>
    <div class="admin-body">
      <header class="admin-topbar">
        <div class="admin-topbar__crumb">
          <NuxtLink to="/" class="admin-topbar__home">商城首页</NuxtLink>
          <span class="admin-topbar__sep">/</span>
          <span class="admin-topbar__current">{{ authState.username || '管理后台' }}</span>
        </div>
        <div class="admin-topbar__user">
          <span class="admin-topbar__name">{{ authState.username || '管理员' }}</span>
          <button class="admin-topbar__logout" @click="onLogout">退出</button>
        </div>
      </header>
      <main class="admin-content">
        <NuxtPage />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  min-height: 100vh;
}
.admin-sidebar {
  width: 220px;
  flex-shrink: 0;
  background-color: var(--color-ink);
  color: #fff;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}
.admin-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5);
  text-decoration: none;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.admin-brand__logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background-color: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--fs-sm);
}
.admin-brand__name {
  font-weight: 600;
  font-size: var(--fs-base);
}
.admin-menu {
  flex: 1;
  padding: var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.admin-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  font-size: var(--fs-sm);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.admin-menu__item:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.admin-menu__item--active {
  background-color: rgba(225, 37, 27, 0.85);
  color: #fff;
}
.admin-menu__icon {
  font-size: var(--fs-base);
  line-height: 1;
}
.admin-sidebar__foot {
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.admin-sidebar__link {
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: var(--fs-sm);
}
.admin-sidebar__link:hover { color: #fff; }

.admin-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.admin-topbar {
  height: 56px;
  flex-shrink: 0;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  position: sticky;
  top: 0;
  z-index: 10;
}
.admin-topbar__crumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
}
.admin-topbar__home {
  color: var(--color-text-secondary);
  text-decoration: none;
}
.admin-topbar__home:hover { color: var(--color-primary); }
.admin-topbar__sep { color: var(--color-border-strong); }
.admin-topbar__current { color: var(--color-ink); font-weight: 600; }
.admin-topbar__user {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.admin-topbar__name { font-size: var(--fs-sm); color: var(--color-ink); font-weight: 500; }
.admin-topbar__logout {
  border: 1px solid var(--color-border-strong);
  background: none;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.admin-topbar__logout:hover { color: var(--color-danger); border-color: var(--color-danger); }

.admin-content {
  flex: 1;
  background-color: var(--color-bg);
}
</style>
