<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{ value: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref(false)

async function render() {
  if (!canvas.value || !props.value || error.value) return
  try {
    await QRCode.toCanvas(canvas.value, props.value, { width: 200 })
  } catch {
    error.value = true
  }
}

onMounted(render)
watch(() => props.value, () => { error.value = false; render() })
</script>

<template>
  <div class="payment-qr">
    <canvas ref="canvas"></canvas>
    <p v-if="error" class="payment-qr__error">二维码生成失败</p>
  </div>
</template>

<style scoped>
.payment-qr { display: inline-block; }
.payment-qr__error {
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
</style>
