<script setup lang="ts">
withDefaults(defineProps<{
  hover?: boolean
}>(), {
  hover: false
})
</script>

<template>
  <div class="ui-card" :class="{ 'ui-card--hover': hover }">
    <slot />
  </div>
</template>

<style scoped>
.ui-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.ui-card--hover {
  transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.ui-card--hover:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}
</style>
