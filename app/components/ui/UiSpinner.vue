<template>
  <svg
    class="ui-spinner"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.ui-spinner {
  animation: ui-spin 0.8s linear infinite;
  color: currentColor;
}
@keyframes ui-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-spinner {
    animation-duration: 1.6s;
  }
}
</style>
