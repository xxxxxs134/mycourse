<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

type CourseRow = {
  id: number
  title: string
  description: string
  price: number
  stock: number
  onSale: boolean
  sold: number
  status: 'ok' | 'low' | 'soldout'
}

type TabKey = 'all' | 'onSale' | 'offSale' | 'low' | 'soldout'

type AdminStats = {
  stats: {
    totalCourses: number
    totalStock: number
    totalSold: number
    lowStockCount: number
    pendingOrders: number
  }
  courses: CourseRow[]
}

const { $api } = useNuxtApp()
const { data, refresh, status } = await useAsyncData<AdminStats>(
  'admin-stats',
  () => $api<AdminStats>('/api/admin/stats'),
  { server: false }
)

const keyword = ref('')
const tab = ref<TabKey>('all')
const sortKey = ref<'price' | 'sold' | 'stock' | null>(null)
const sortDir = ref<'asc' | 'desc'>('desc')
const page = ref(1)
const pageSize = ref(10)
const selected = ref<Set<number>>(new Set())
const editing = ref<Record<number, boolean>>({})
const batchLoading = ref(false)
const toast = ref('')

const tabs = computed(() => {
  const courses = data.value?.courses ?? []
  const count = (fn: (c: CourseRow) => boolean) => courses.filter(fn).length
  const items: { key: TabKey, label: string, count: number }[] = [
    { key: 'all', label: '全部', count: courses.length },
    { key: 'onSale', label: '在售', count: count((c) => c.onSale) },
    { key: 'offSale', label: '已下架', count: count((c) => !c.onSale) },
    { key: 'low', label: '库存告急', count: count((c) => c.status === 'low') },
    { key: 'soldout', label: '已售罄', count: count((c) => c.status === 'soldout') }
  ]
  return items
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return (data.value?.courses ?? []).filter((c: CourseRow) => {
    if (tab.value === 'onSale' && !c.onSale) return false
    if (tab.value === 'offSale' && c.onSale) return false
    if (tab.value !== 'all' && tab.value !== 'onSale' && tab.value !== 'offSale' && c.status !== tab.value) return false
    if (kw && !c.title.toLowerCase().includes(kw)) return false
    return true
  })
})

const sorted = computed(() => {
  const list = [...filtered.value]
  if (!sortKey.value) return list
  const dir = sortDir.value === 'asc' ? 1 : -1
  const k = sortKey.value
  return list.sort((a, b) => (a[k] - b[k]) * dir)
})

const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)))

const statsCards = computed(() => {
  const s = data.value?.stats
  return [
    { label: '课程总数', value: s?.totalCourses ?? 0, icon: '📚', tone: 'primary' },
    { label: '在库总量', value: s?.totalStock ?? 0, icon: '📦', tone: 'accent' },
    { label: '已售出', value: s?.totalSold ?? 0, icon: '💰', tone: 'success' },
    { label: '待付款订单', value: s?.pendingOrders ?? 0, icon: '⏳', tone: 'warning' }
  ]
})

const allChecked = computed(() => paged.value.length > 0 && paged.value.every((c) => selected.value.has(c.id)))

function toggleAll() {
  const next = new Set(selected.value)
  if (allChecked.value) {
    for (const c of paged.value) next.delete(c.id)
  } else {
    for (const c of paged.value) next.add(c.id)
  }
  selected.value = next
}

function toggleOne(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleSort(key: 'price' | 'sold' | 'stock') {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

function statusOf(c: CourseRow) {
  return { key: c.status, label: c.status === 'ok' ? '库存充足' : c.status === 'low' ? '库存告急' : '已售罄' }
}

function startEdit(id: number) {
  editing.value[id] = true
}

async function save(id: number) {
  const c = (data.value?.courses ?? []).find((x: CourseRow) => x.id === id)
  if (!c) return
  try {
    await $api(`/api/courses/${id}`, {
      method: 'PUT',
      body: { stock: Number(c.stock), title: c.title, price: Number(c.price) }
    })
    editing.value[id] = false
    showToast('已保存')
    await refresh()
  } catch (e: any) {
    showToast(e?.data?.message || e?.data?.statusMessage || '保存失败')
  }
}

async function cancelEdit(id: number) {
  editing.value[id] = false
  await refresh()
}

async function toggleOnSale(c: CourseRow, on: boolean) {
  try {
    await $api(`/api/courses/${c.id}`, {
      method: 'PUT',
      body: { onSale: on }
    })
    showToast(on ? '已上架' : '已下架')
    await refresh()
  } catch (e: any) {
    showToast(e?.data?.message || e?.data?.statusMessage || '操作失败')
  }
}

async function batchAction(action: 'onSale' | 'offSale' | 'delete') {
  if (!selected.value.size) return
  const ids = [...selected.value]
  if (action === 'delete' && !confirm(`确定删除选中的 ${ids.length} 门课程吗？`)) return
  batchLoading.value = true
  try {
    await $api('/api/admin/batch', {
      method: 'POST',
      body: { ids, action }
    })
    selected.value = new Set()
    showToast(action === 'onSale' ? '已批量上架' : action === 'offSale' ? '已批量下架' : '已删除')
    await refresh()
  } catch (e: any) {
    showToast(e?.data?.message || e?.data?.statusMessage || '批量操作失败')
  } finally {
    batchLoading.value = false
  }
}

let toastTimer: any = null
function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2000)
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="admin">
    <div class="admin__header">
      <div class="admin__crumbs">
        <span class="admin__crumb">首页</span>
        <span class="admin__crumb-sep">/</span>
        <span class="admin__crumb">商品管理</span>
        <span class="admin__crumb-sep">/</span>
        <span class="admin__crumb admin__crumb--current">库存管理</span>
      </div>
      <div class="admin__title-row">
        <h1 class="admin__title">库存管理</h1>
        <span class="admin__meta">管理课程上架状态与库存</span>
      </div>
    </div>

    <div class="admin__stats">
      <div v-for="card in statsCards" :key="card.label" class="stat" :class="`stat--${card.tone}`">
        <div class="stat__icon">{{ card.icon }}</div>
        <div class="stat__body">
          <div class="stat__value">{{ card.value }}</div>
          <div class="stat__label">{{ card.label }}</div>
        </div>
      </div>
    </div>

    <div class="admin__panel">
      <div class="admin__tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="admin__tab"
          :class="{ 'admin__tab--active': tab === t.key }"
          @click="tab = t.key; page = 1"
        >
          {{ t.label }}<span class="admin__tab-count">{{ t.count }}</span>
        </button>
      </div>

      <div class="admin__toolbar">
        <div class="admin__filters">
          <input
            v-model="keyword"
            type="text"
            class="admin__search"
            placeholder="搜索课程名称"
            @input="page = 1"
          >
          <select v-model="pageSize" class="admin__select" @change="page = 1">
            <option :value="10">每页 10</option>
            <option :value="20">每页 20</option>
            <option :value="50">每页 50</option>
          </select>
        </div>
        <div class="admin__toolbar-right">
          <template v-if="selected.size > 0">
            <UiButton size="sm" variant="outline" :loading="batchLoading" @click="batchAction('onSale')">批量上架</UiButton>
            <UiButton size="sm" variant="outline" :loading="batchLoading" @click="batchAction('offSale')">批量下架</UiButton>
            <UiButton size="sm" variant="outline" :loading="batchLoading" @click="batchAction('delete')">批量删除</UiButton>
            <span class="admin__batch-hint">已选 {{ selected.size }} 项</span>
          </template>
          <UiButton size="sm" variant="outline" @click="refresh">刷新</UiButton>
        </div>
      </div>

      <table class="admin__table">
        <thead>
          <tr>
            <th class="admin__col-check">
              <input
                type="checkbox"
                class="admin__checkbox"
                :checked="allChecked"
                @change="toggleAll"
              >
            </th>
            <th class="admin__col-id">ID</th>
            <th>课程名称</th>
            <th class="admin__th-sort" @click="toggleSort('price')">
              价格
              <span class="admin__sort">{{ sortKey === 'price' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
            <th class="admin__th-sort" @click="toggleSort('sold')">
              已售
              <span class="admin__sort">{{ sortKey === 'sold' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
            <th class="admin__th-sort" @click="toggleSort('stock')">
              当前库存
              <span class="admin__sort">{{ sortKey === 'stock' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
            <th>上架状态</th>
            <th>库存状态</th>
            <th class="admin__col-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in paged" :key="c.id" :class="{ 'admin__row--muted': !c.onSale }">
            <td class="admin__col-check">
              <input
                type="checkbox"
                class="admin__checkbox"
                :checked="selected.has(c.id)"
                @change="toggleOne(c.id)"
              >
            </td>
            <td class="admin__col-id">{{ c.id }}</td>
            <td class="admin__col-title">
              <input
                v-if="editing[c.id]"
                v-model="c.title"
                type="text"
                class="admin__title-input"
              >
              <span v-else>{{ c.title || '（未命名课程）' }}</span>
            </td>
            <td>
              <input
                v-if="editing[c.id]"
                v-model.number="c.price"
                type="number"
                min="0"
                class="admin__stock-input"
              >
              <span v-else>¥{{ c.price }}</span>
            </td>
            <td>{{ c.sold }}</td>
            <td>
              <input
                v-if="editing[c.id]"
                v-model.number="c.stock"
                type="number"
                min="0"
                class="admin__stock-input"
              >
              <span v-else :class="{ 'admin__stock--danger': c.stock <= 0 }">{{ c.stock }}</span>
            </td>
            <td>
              <UiBadge :variant="c.onSale ? 'success' : 'neutral'">{{ c.onSale ? '在售' : '已下架' }}</UiBadge>
            </td>
            <td>
              <UiBadge :variant="c.status === 'ok' ? 'success' : c.status === 'low' ? 'accent' : 'danger'">
                {{ statusOf(c).label }}
              </UiBadge>
            </td>
            <td class="admin__col-op">
              <template v-if="editing[c.id]">
                <a class="admin__link" @click="save(c.id)">保存</a>
                <span class="admin__sep">|</span>
                <a class="admin__link admin__link--muted" @click="cancelEdit(c.id)">取消</a>
              </template>
              <template v-else>
                <a class="admin__link" @click="startEdit(c.id)">编辑</a>
                <span class="admin__sep">|</span>
                <a class="admin__link" @click="toggleOnSale(c, !c.onSale)">{{ c.onSale ? '下架' : '上架' }}</a>
              </template>
            </td>
          </tr>
          <tr v-if="!paged.length">
            <td colspan="9" class="admin__empty">
              {{ status === 'pending' ? '加载中...' : '没有符合条件的课程' }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="admin__footer">
        <span>共 {{ sorted.length }} 门课程</span>
        <div class="admin__pager">
          <button
            class="admin__page-btn"
            :disabled="page <= 1"
            @click="page = Math.max(1, page - 1)"
          >上一页</button>
          <span class="admin__page-info">{{ page }} / {{ totalPages }}</span>
          <button
            class="admin__page-btn"
            :disabled="page >= totalPages"
            @click="page = Math.min(totalPages, page + 1)"
          >下一页</button>
        </div>
      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="admin__toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.admin {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-16);
}
.admin__header { margin-bottom: var(--space-5); }
.admin__crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}
.admin__crumb--current { color: var(--color-ink); }
.admin__title-row { display: flex; align-items: baseline; gap: var(--space-3); }
.admin__title {
  margin: 0;
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--color-ink);
}
.admin__meta { color: var(--color-text-secondary); font-size: var(--fs-sm); }

.admin__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}
@media (max-width: 900px) { .admin__stats { grid-template-columns: repeat(2, 1fr); } }

.stat {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}
.stat__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.stat--primary .stat__icon { background: var(--color-primary-subtle); }
.stat--accent .stat__icon { background: #EFF6FF; }
.stat--success .stat__icon { background: #F0FDF4; }
.stat--warning .stat__icon { background: #FFFBEB; }
.stat__value { font-size: var(--fs-xl); font-weight: 700; color: var(--color-ink); line-height: 1.1; }
.stat__label { font-size: var(--fs-sm); color: var(--color-text-secondary); }

.admin__panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.admin__tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-5) 0;
  border-bottom: 1px solid var(--color-border);
}
.admin__tab {
  position: relative;
  padding: var(--space-3) var(--space-4);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}
.admin__tab--active { color: var(--color-primary); }
.admin__tab--active::after {
  content: '';
  position: absolute;
  left: var(--space-4);
  right: var(--space-4);
  bottom: -1px;
  height: 2px;
  background: var(--color-primary);
}
.admin__tab-count {
  margin-left: var(--space-1);
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}
.admin__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.admin__filters { display: flex; gap: var(--space-3); }
.admin__toolbar-right { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.admin__batch-hint { font-size: var(--fs-sm); color: var(--color-primary); }
.admin__select,
.admin__search {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  outline-offset: 2px;
}
.admin__search { width: 240px; }
.admin__search:focus,
.admin__select:focus { border-color: var(--color-primary); }

.admin__table { width: 100%; border-collapse: collapse; }
.admin__table th {
  text-align: left;
  background: var(--color-surface-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.admin__table td {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--fs-sm);
  color: var(--color-ink);
}
.admin__table tbody tr:last-child td { border-bottom: none; }
.admin__table tbody tr:hover { background: var(--color-surface-subtle); }
.admin__row--muted td { color: var(--color-text-muted); }
.admin__col-check { width: 40px; }
.admin__checkbox { width: 16px; height: 16px; accent-color: var(--color-primary); }
.admin__col-id { width: 60px; color: var(--color-text-muted); }
.admin__col-title { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin__col-op { width: 120px; }
.admin__th-sort { cursor: pointer; user-select: none; }
.admin__sort { color: var(--color-primary); font-weight: 700; }
.admin__stock--danger { color: var(--color-danger); font-weight: 600; }
.admin__stock-input {
  width: 80px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
}
.admin__title-input {
  width: 240px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
}
.admin__link { color: var(--color-primary); cursor: pointer; font-size: var(--fs-sm); }
.admin__link:hover { text-decoration: underline; }
.admin__link--muted { color: var(--color-text-muted); }
.admin__sep { margin: 0 var(--space-2); color: var(--color-border-strong); }
.admin__empty { text-align: center; color: var(--color-text-muted); padding: var(--space-12) !important; }

.admin__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
}
.admin__pager { display: flex; align-items: center; gap: var(--space-3); }
.admin__page-btn {
  height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.admin__page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.admin__page-btn:not(:disabled):hover { border-color: var(--color-primary); color: var(--color-primary); }
.admin__page-info { font-size: var(--fs-sm); color: var(--color-text-secondary); }

.admin__toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #323232;
  color: #fff;
  font-size: var(--fs-sm);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 100;
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>
