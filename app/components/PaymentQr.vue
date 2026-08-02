<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{ value: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)

onMounted(async () => {
  await QRCode.toCanvas(canvas.value, props.value, { width: 200 })
})
</script>

<template>
  <canvas ref="canvas"></canvas>
</template>
