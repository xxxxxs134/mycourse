<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  block?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  block: false,
  type: 'button'
})
</script>

<template>
  <button
    :type="type"
    class="ui-btn"
    :class="[`ui-btn--${variant}`, `ui-btn--${size}`, { 'ui-btn--block': block, 'ui-btn--disabled': disabled || loading }]"
    :disabled="disabled || loading"
  >
    <UiSpinner v-if="loading" class="ui-btn__spinner" />
    <slot v-else />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.05s ease;
  outline-offset: 2px;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
}
.ui-btn:active:not(.ui-btn--disabled) {
  transform: translateY(1px);
}
.ui-btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-btn--sm { padding: var(--space-2) var(--space-3); font-size: var(--fs-sm); }
.ui-btn--md { padding: var(--space-3) var(--space-6); font-size: var(--fs-base); }
.ui-btn--lg { padding: var(--space-4) var(--space-8); font-size: var(--fs-lg); }

.ui-btn--block { width: 100%; }

.ui-btn--primary {
  background-color: var(--color-primary);
  color: #fff;
}
.ui-btn--primary:hover:not(.ui-btn--disabled) {
  background-color: var(--color-primary-hover);
}

.ui-btn--outline {
  background-color: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-ink);
}
.ui-btn--outline:hover:not(.ui-btn--disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.ui-btn--ghost {
  background-color: transparent;
  color: var(--color-text-secondary);
}
.ui-btn--ghost:hover:not(.ui-btn--disabled) {
  background-color: var(--color-surface-subtle);
  color: var(--color-ink);
}

.ui-btn__spinner {
  width: 1em;
  height: 1em;
}
</style>
