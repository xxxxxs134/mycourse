<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'success' | 'neutral' | 'accent' | 'danger'
}>(), {
  variant: 'neutral'
})
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${variant}`">
    <slot />
  </span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1.6;
}

.ui-badge--primary {
  background-color: var(--color-primary);
  color: #fff;
}
.ui-badge--success {
  background-color: #F0FDF4;
  color: var(--color-success);
}
.ui-badge--neutral {
  background-color: var(--color-surface-subtle);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.ui-badge--accent {
  background-color: #EFF6FF;
  color: var(--color-accent);
}
.ui-badge--danger {
  background-color: #FEF2F2;
  color: var(--color-danger);
}
</style>
