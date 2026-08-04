<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'admin'
})

type Movement = {
  id: number
  courseId: number
  title: string
  type: string
  quantity: number
  beforeQty: number
  afterQty: number
  remark: string
  createdAt: string
}

type MovementsData = {
  total: number
  page: number
  pageSize: number
  items: Movement[]
}

const { $api } = useNuxtApp()

const typeFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const data = ref<MovementsData | null>(null)
const loading = ref(false)
const error = ref('')

const typeOptions = [
  { key: '', label: '全部类型' },
  { key: 'in', label: '入库' },
  { key: 'out', label: '出库' },
  { key: 'sale', label: '销售' },
  { key: 'release', label: '超时释放' },
  { key: 'adjust', label: '调整' },
  { key: 'create', label: '创建' }
]

const typeLabel = (t: string) => typeOptions.find((o) => o.key === t)?.label ?? t
const typeVariant = (t: string) => {
  if (t === 'in') return 'success'
  if (t === 'sale') return 'primary'
  if (t === 'out') return 'danger'
  if (t === 'release') return 'accent'
  return 'neutral'
}

let reqId = 0
async function load() {
  loading.value = true
  error.value = ''
  const myId = ++reqId
  try {
    const q: Record<string, string> = { page: String(page.value), pageSize: String(pageSize.value) }
    if (typeFilter.value) q.type = typeFilter.value
    const query = new URLSearchParams(q).toString()
    const res = await $api<MovementsData>(`/api/stock/movements?${query}`)
    if (myId === reqId) data.value = res // 丢弃过期响应，防快速切换筛选/翻页错位
  } catch (e: any) {
    if (myId === reqId) error.value = e?.data?.message || e?.data?.statusMessage || '加载流水失败'
  } finally {
    if (myId === reqId) loading.value = false
  }
}

watch([typeFilter, page], load)
onMounted(load)

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / pageSize.value)))

function fmtTime(d: string) {
  const date = new Date(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <div class="mov">
    <div class="mov__header">
      <h1 class="mov__title">库存流水</h1>
      <p class="mov__meta">所有入库 / 出库 / 销售 / 释放记录</p>
    </div>

    <div class="mov__panel">
      <div class="mov__toolbar">
        <select v-model="typeFilter" class="mov__select">
          <option v-for="opt in typeOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
        <span class="mov__count">共 {{ data?.total ?? 0 }} 条记录</span>
      </div>

      <div v-if="error" class="mov__error">{{ error }}</div>

      <table class="mov__table">
        <thead>
          <tr>
            <th>时间</th>
            <th>商品</th>
            <th>类型</th>
            <th class="mov__num">变动量</th>
            <th class="mov__num">变动前</th>
            <th class="mov__num">变动后</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in data?.items ?? []" :key="m.id">
            <td class="mov__time">{{ fmtTime(m.createdAt) }}</td>
            <td class="mov__title-cell">
              <NuxtLink :to="`/courses/${m.courseId}`" class="mov__link">{{ m.title || `#${m.courseId}` }}</NuxtLink>
            </td>
            <td>
              <UiBadge :variant="typeVariant(m.type)">{{ typeLabel(m.type) }}</UiBadge>
            </td>
            <td class="mov__num" :class="m.quantity > 0 ? 'mov__qty--up' : m.quantity < 0 ? 'mov__qty--down' : ''">
              {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
            </td>
            <td class="mov__num">{{ m.beforeQty }}</td>
            <td class="mov__num">{{ m.afterQty }}</td>
            <td class="mov__remark">{{ m.remark }}</td>
          </tr>
          <tr v-if="loading">
            <td colspan="7" class="mov__empty">加载中...</td>
          </tr>
          <tr v-else-if="!data?.items?.length">
            <td colspan="7" class="mov__empty">暂无流水记录</td>
          </tr>
        </tbody>
      </table>

      <div class="mov__footer">
        <span>第 {{ data?.page ?? 1 }} / {{ totalPages }} 页</span>
        <div class="mov__pager">
          <button class="mov__page-btn" :disabled="page <= 1" @click="page = Math.max(1, page - 1)">上一页</button>
          <button class="mov__page-btn" :disabled="page >= totalPages" @click="page = Math.min(totalPages, page + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mov {
  padding: var(--space-6) var(--space-8) var(--space-16);
}
.mov__header { margin-bottom: var(--space-5); }
.mov__title { margin: 0; font-size: var(--fs-2xl); font-weight: 700; color: var(--color-ink); }
.mov__meta { margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: var(--fs-sm); }

.mov__panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.mov__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}
.mov__select {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  background: var(--color-surface);
  color: var(--color-ink);
}
.mov__count { font-size: var(--fs-sm); color: var(--color-text-muted); }
.mov__error { padding: var(--space-4); color: var(--color-danger); font-size: var(--fs-sm); }

.mov__table { width: 100%; border-collapse: collapse; }
.mov__table th {
  text-align: left;
  background: var(--color-surface-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.mov__table td {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--fs-sm);
  color: var(--color-ink);
}
.mov__table tbody tr:last-child td { border-bottom: none; }
.mov__table tbody tr:hover { background: var(--color-surface-subtle); }
.mov__time { color: var(--color-text-secondary); white-space: nowrap; }
.mov__title-cell { max-width: 260px; }
.mov__link { color: var(--color-primary); text-decoration: none; }
.mov__link:hover { text-decoration: underline; }
.mov__num { text-align: right; font-variant-numeric: tabular-nums; }
.mov__qty--up { color: var(--color-success); font-weight: 600; }
.mov__qty--down { color: var(--color-danger); font-weight: 600; }
.mov__remark { color: var(--color-text-secondary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mov__empty { text-align: center; color: var(--color-text-muted); padding: var(--space-12) !important; }

.mov__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
}
.mov__pager { display: flex; align-items: center; gap: var(--space-3); }
.mov__page-btn {
  height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.mov__page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mov__page-btn:not(:disabled):hover { border-color: var(--color-primary); color: var(--color-primary); }
</style>
