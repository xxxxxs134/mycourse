<script setup lang="ts">
definePageMeta({
  middleware: 'customer-auth'
})

type MyCourse = {
  id: number
  title: string
  description: string
  price: number
  category: string
  cover: string
  onSale: boolean
  paidAt: string
  stock?: number
}

const { $api } = useNuxtApp()
const { data, error, refresh, status } = await useAsyncData<MyCourse[]>(
  'my-courses',
  () => $api<MyCourse[]>('/api/me/courses'),
  { server: false }
)

const totalPaid = computed(() => data.value?.length ?? 0)
</script>

<template>
  <div class="page">
    <div class="page__header">
      <h1 class="page__title">我的课程</h1>
      <p class="page__subtitle">
        <template v-if="totalPaid > 0">已购买 {{ totalPaid }} 门课程</template>
        <template v-else>还没有购买课程</template>
      </p>
    </div>

    <div v-if="error" class="empty">
      <p class="empty__text error-text">{{ (error as any)?.data?.message || (error as any)?.statusMessage || '加载失败，请重试' }}</p>
      <UiButton variant="outline" size="sm" @click="refresh()">刷新</UiButton>
    </div>

    <div v-else-if="data?.length" class="course-grid">
      <CourseCard v-for="course in data" :key="course.id" :course="course" />
    </div>

    <div v-else-if="status !== 'pending'" class="empty">
      <p class="empty__text">你还没有购买任何课程</p>
      <NuxtLink to="/"><UiButton variant="primary">去逛逛课程</UiButton></NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}
.page__header {
  margin-bottom: var(--space-8);
}
.page__title {
  margin: 0;
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--color-ink);
}
.page__subtitle {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}
.course-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
}
@media (min-width: 640px) {
  .course-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 900px) {
  .course-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1120px) {
  .course-grid { grid-template-columns: repeat(4, 1fr); }
}
.empty {
  padding: var(--space-10);
  text-align: center;
}
.empty__text {
  margin: 0 0 var(--space-4);
  color: var(--color-text-secondary);
}
.error-text {
  color: var(--color-danger);
}
</style>
