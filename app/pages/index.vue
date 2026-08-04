<script setup lang="ts">
const keyword = ref('')
const activeCategory = ref('')
const pending = ref(0)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const { data: courses, error, refresh, status } = await useFetch<Array<{ id: number, title: string, description: string, price: number, stock: number, sold: number, category: string, cover: string, unlocked: boolean }>>('/api/courses', {
  server: false,
  credentials: 'include',
  query: computed(() => {
    const q: Record<string, string> = {}
    if (keyword.value.trim()) q.q = keyword.value.trim()
    if (activeCategory.value) q.category = activeCategory.value
    return q
  })
})

function onSearchInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  pending.value++
  debounceTimer = setTimeout(async () => {
    await refresh()
    pending.value = Math.max(0, pending.value - 1)
  }, 400)
}

async function selectCategory(cat: string) {
  activeCategory.value = cat
  await refresh()
}

const categories = computed(() => {
  const set = new Set<string>()
  for (const c of courses.value ?? []) {
    if (c.category) set.add(c.category)
  }
  return ['', ...set]
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="page">
    <div class="hero">
      <h1 class="hero__title">发现好课</h1>
      <p class="hero__subtitle">从入门到进阶，挑选一门课程开始学习</p>
      <div class="hero__search">
        <svg class="hero__search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <input
          v-model="keyword"
          type="text"
          class="hero__search-input"
          placeholder="搜索课程名称..."
          @input="onSearchInput"
        >
      </div>
    </div>

    <div v-if="categories.length > 1" class="cats">
      <button
        v-for="cat in categories"
        :key="cat"
        class="cats__btn"
        :class="{ 'cats__btn--active': activeCategory === cat }"
        @click="selectCategory(cat)"
      >
        {{ cat || '全部' }}
      </button>
    </div>

    <div v-if="error" class="empty">
      <p class="empty__text error-text">{{ error?.statusMessage || error?.message || '加载失败，请重试' }}</p>
      <UiButton variant="outline" size="sm" @click="refresh()">刷新</UiButton>
    </div>

    <div v-else-if="(courses?.length ?? 0) > 0" class="course-grid">
      <CourseCard v-for="course in courses!" :key="course.id" :course="course" />
    </div>

    <div v-else class="empty">
      <p class="empty__text">
        {{ status === 'pending' || pending > 0 ? '搜索中...' : '暂无匹配的课程' }}
      </p>
      <UiButton v-if="keyword || activeCategory" variant="outline" size="sm" @click="keyword = ''; activeCategory = ''; refresh()">
        清除筛选
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}
.hero {
  text-align: center;
  padding: var(--space-10) 0 var(--space-8);
}
.hero__title {
  margin: 0;
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--color-ink);
}
.hero__subtitle {
  margin: var(--space-2) 0 var(--space-6);
  color: var(--color-text-secondary);
}
.hero__search {
  position: relative;
  max-width: 480px;
  margin: 0 auto;
}
.hero__search-icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
}
.hero__search-input {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-4) 0 var(--space-10);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  font-size: var(--fs-base);
  font-family: var(--font-sans);
  background: var(--color-surface);
  color: var(--color-ink);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.hero__search-input::placeholder { color: var(--color-text-muted); }
.hero__search-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-color: var(--color-primary);
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
