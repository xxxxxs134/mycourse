<script setup lang="ts">
const { data: courses, error, refresh } = await useFetch<Array<{ id: number, title: string, description: string, price: number, stock: number, category: string, cover: string, unlocked: boolean }>>('/api/courses', {
  server: false,
  credentials: 'include'
})

const activeCategory = ref('')

const categories = computed(() => {
  const set = new Set<string>()
  for (const c of courses.value ?? []) {
    if (c.category) set.add(c.category)
  }
  return ['', ...set]
})

const filtered = computed(() => {
  if (!activeCategory.value) return courses.value ?? []
  return (courses.value ?? []).filter((c) => c.category === activeCategory.value)
})
</script>

<template>
  <div class="page">
    <div class="page__header">
      <h1 class="page__title">课程列表</h1>
      <p class="page__subtitle">选择一门课程，开始学习</p>
    </div>

    <div v-if="categories.length > 1" class="cats">
      <button
        v-for="cat in categories"
        :key="cat"
        class="cats__btn"
        :class="{ 'cats__btn--active': activeCategory === cat }"
        @click="activeCategory = cat"
      >
        {{ cat || '全部' }}
      </button>
    </div>

    <div v-if="error" class="empty">
      <p class="empty__text error-text">{{ error?.statusMessage || error?.message || '加载失败，请重试' }}</p>
      <UiButton variant="outline" size="sm" @click="refresh()">刷新</UiButton>
    </div>

    <div v-else-if="filtered.length" class="course-grid">
      <CourseCard v-for="course in filtered" :key="course.id" :course="course" />
    </div>

    <UiCard v-else class="empty">
      <p class="empty__text">暂无{{ activeCategory ? `「${activeCategory}」分类的` : '' }}课程</p>
      <NuxtLink to="/add"><UiButton variant="outline" size="sm">添加课程</UiButton></NuxtLink>
    </UiCard>
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
  gap: var(--space-4);
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
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.cats__btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}
.cats__btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.cats__btn--active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
</style>
