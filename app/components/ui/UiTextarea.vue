<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  error?: string
  hint?: string
  placeholder?: string
  rows?: number
}>(), {
  placeholder: '',
  rows: 5
})

defineOptions({ inheritAttrs: false })

const value = defineModel<string>('value', { default: '' })
</script>

<template>
  <label class="ui-field">
    <span v-if="label" class="ui-field__label">{{ label }}</span>
    <textarea
      v-bind="$attrs"
      v-model="value"
      :placeholder="placeholder"
      :rows="rows"
      class="ui-textarea"
      :class="{ 'ui-textarea--error': error }"
    />
    <span v-if="hint && !error" class="ui-field__hint">{{ hint }}</span>
    <span v-if="error" class="ui-field__error">{{ error }}</span>
  </label>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
}
.ui-field__label {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--color-ink);
}
.ui-textarea {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  font-family: var(--font-sans);
  color: var(--color-ink);
  background-color: var(--color-surface);
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ui-textarea::placeholder {
  color: var(--color-text-muted);
}
.ui-textarea:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-color: var(--color-primary);
}
.ui-textarea--error {
  border-color: var(--color-danger);
}
.ui-field__hint {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}
.ui-field__error {
  font-size: var(--fs-xs);
  color: var(--color-danger);
}
</style>
