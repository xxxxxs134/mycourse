<script setup lang="ts">
const { checkAuth } = useAuth()
const route = useRoute()

onMounted(() => {
  checkAuth()
})
</script>

<template>
  <NuxtLayout>
    <NuxtRouteAnnouncer />
    <NuxtPage :key="route.path" />
  </NuxtLayout>
</template>

<style>
body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
</style>
