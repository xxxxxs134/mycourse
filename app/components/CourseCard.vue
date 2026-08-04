<script setup lang="ts">
const props = defineProps<{
  course: {
    id: number
    title: string
    description: string
    price: number
    stock?: number
    sold?: number
    unlocked?: boolean
    category?: string
    cover?: string
  }
}>()

const palettes = [
  'linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%)',
  'linear-gradient(135deg, #EFF6FF 0%, #BFDBFE 100%)',
  'linear-gradient(135deg, #F5F3FF 0%, #C4B5FD 100%)',
  'linear-gradient(135deg, #ECFDF5 0%, #A7F3D0 100%)'
]
const coverGradient = palettes[props.course.id % palettes.length]
const coverIcon = ['📘', '🎓', '🚀', '🧠'][props.course.id % 4]
const hasCover = computed(() => !!props.course.cover)
const showCover = computed(() => props.course.cover || coverIcon)
</script>

<template>
  <NuxtLink :to="`/courses/${course.id}`" class="product-link">
    <UiCard hover class="product-card">
      <div class="product-card__cover" :style="hasCover ? {} : { background: coverGradient }">
        <img
          v-if="hasCover && course.cover!.startsWith('http')"
          :src="course.cover"
          :alt="course.title"
          class="product-card__img"
          loading="lazy"
        >
        <span v-else class="product-card__cover-icon">{{ showCover }}</span>
        <span v-if="course.unlocked" class="product-card__tag product-card__tag--owned">已解锁</span>
        <span v-else-if="course.stock === 0" class="product-card__tag product-card__tag--soldout">已售罄</span>
      </div>
      <div class="product-card__body">
        <div v-if="course.category" class="product-card__cat">{{ course.category }}</div>
        <h3 class="product-card__title">{{ course.title }}</h3>
        <div class="product-card__bottom">
          <span class="product-card__price">
            <span class="product-card__price-symbol">¥</span>{{ course.price }}
          </span>
          <span v-if="(course.sold ?? 0) > 0" class="product-card__sold">{{ course.sold }} 人已购</span>
        </div>
      </div>
    </UiCard>
  </NuxtLink>
</template>

<style scoped>
.product-link {
  text-decoration: none;
  color: inherit;
  display: block;
  height: 100%;
}
.product-card {
  display: flex;
  flex-direction: column;
  padding: 0;
  height: 100%;
  overflow: hidden;
}
.product-card__cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}
.product-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.product-card__cover-icon {
  font-size: 56px;
  line-height: 1;
}
.product-card__tag,
.product-card__owned,
.product-card__soldout {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.product-card__tag--owned {
  background-color: #F0FDF4;
  color: var(--color-success);
}
.product-card__tag--soldout {
  background-color: rgba(255, 255, 255, 0.9);
  color: var(--color-danger);
}
.product-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  flex: 1;
}
.product-card__cat {
  align-self: flex-start;
  font-size: var(--fs-xs);
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  font-weight: 500;
}
.product-card__title {
  margin: 0;
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--color-ink);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.8em;
}
.product-card__bottom {
  margin-top: auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.product-card__price {
  color: var(--color-danger);
  font-weight: 700;
  font-size: var(--fs-lg);
}
.product-card__price-symbol {
  font-size: var(--fs-xs);
  margin-right: 1px;
}
.product-card__sold {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}
</style>
