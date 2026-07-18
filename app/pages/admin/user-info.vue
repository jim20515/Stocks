<script setup lang="ts">
const { isAdmin } = useAdmin()

const { data, pending, refresh, error } = useAuthFetch<any>('/api/admin/user-portfolios', { key: 'admin-user-portfolios' })
const users = computed<any[]>(() => data.value?.users ?? [])
const priceDate = computed<string | null>(() => data.value?.priceDate ?? null)

// ── 搜尋 ──
const search = ref('')
const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u => (u.email ?? '').toLowerCase().includes(q))
})

// ── 排序 ──
const sortKey = ref('totalValue')
const sortDir = ref<'asc' | 'desc'>('desc')
function toggleSort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'desc' }
  currentPage.value = 1
}
const sortedUsers = computed(() => {
  if (!sortKey.value) return filteredUsers.value
  return [...filteredUsers.value].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'zh-TW') : av - bv
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

// ── 分頁 ──
const pageSize = 10
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(sortedUsers.value.length / pageSize)))
const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedUsers.value.slice(start, start + pageSize)
})
function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}
watch(search, () => { currentPage.value = 1 })

const sortIcon = (key: string) => sortKey.value === key ? (sortDir.value === 'asc' ? '↑' : '↓') : '↕'

const money = (n: number) => Math.round(n ?? 0).toLocaleString('zh-TW')
const profitClass = (n: number) => n > 0 ? 'text-red-500' : n < 0 ? 'text-green-600' : 'text-slate-400'
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold text-slate-800">使用者資訊</h2>
        <p class="text-xs text-slate-400 mt-0.5">
          各帳號的總成本／總市值／未實現損益／實現損益（僅顯示，管理員可見）
          <span v-if="priceDate" class="ml-1">· 股價時間 {{ priceDate }}</span>
        </p>
      </div>
      <button v-if="isAdmin && !error" @click="refresh()" :disabled="pending"
        class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition">
        <svg class="w-3.5 h-3.5" :class="pending ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ pending ? '更新中…' : '重新整理' }}
      </button>
    </div>

    <!-- 無權限 -->
    <div v-if="!isAdmin || error" class="bg-white rounded-2xl border border-slate-200 p-10 text-center">
      <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <p class="text-sm font-medium text-slate-700 mb-1">沒有存取權限</p>
      <p class="text-sm text-slate-400">此頁面僅限管理員檢視。</p>
    </div>

    <!-- 使用者列表 -->
    <div v-else class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div class="relative">
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input v-model="search" type="text" placeholder="搜尋 Email…"
            class="w-56 sm:w-72 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <p class="text-xs text-slate-400 shrink-0">共 {{ sortedUsers.length }} 個帳號</p>
      </div>

      <!-- 載入中 -->
      <div v-if="pending && !users.length" class="py-12 text-center text-sm text-slate-400 animate-pulse">載入中…</div>
      <div v-else-if="sortedUsers.length === 0" class="py-12 text-center text-sm text-slate-400">無符合的帳號</div>

      <template v-else>
      <div class="hidden sm:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('email')">
                Email <span class="ml-1 opacity-50">{{ sortIcon('email') }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('totalCost')">
                總成本 <span class="ml-1 opacity-50">{{ sortIcon('totalCost') }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('totalValue')">
                總市值 <span class="ml-1 opacity-50">{{ sortIcon('totalValue') }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('unrealizedProfit')">
                未實現損益 <span class="ml-1 opacity-50">{{ sortIcon('unrealizedProfit') }}</span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('realizedProfit')">
                實現損益 <span class="ml-1 opacity-50">{{ sortIcon('realizedProfit') }}</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="u in pagedUsers" :key="u.userId" class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5 text-slate-700">
                {{ u.email }}
                <span v-if="u.holdingsCount === 0" class="ml-1.5 text-xs text-slate-300">（無持股）</span>
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-slate-600">{{ money(u.totalCost) }}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-slate-800 font-medium">{{ money(u.totalValue) }}</td>
              <td class="px-4 py-3.5 text-right tabular-nums font-medium" :class="profitClass(u.unrealizedProfit)">
                {{ u.unrealizedProfit > 0 ? '+' : '' }}{{ money(u.unrealizedProfit) }}
              </td>
              <td class="px-5 py-3.5 text-right tabular-nums font-medium" :class="profitClass(u.realizedProfit)">
                {{ u.realizedProfit > 0 ? '+' : '' }}{{ money(u.realizedProfit) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- 手機卡片 -->
      <div class="sm:hidden divide-y divide-slate-100">
        <div v-for="u in pagedUsers" :key="u.userId" class="p-4">
          <p class="text-sm font-medium text-slate-700 break-all mb-2">{{ u.email }}<span v-if="u.holdingsCount === 0" class="ml-1.5 text-xs text-slate-300">（無持股）</span></p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div class="flex justify-between gap-2"><span class="text-slate-400">總成本</span><span class="tabular-nums text-slate-600">{{ money(u.totalCost) }}</span></div>
            <div class="flex justify-between gap-2"><span class="text-slate-400">總市值</span><span class="tabular-nums text-slate-800 font-medium">{{ money(u.totalValue) }}</span></div>
            <div class="flex justify-between gap-2"><span class="text-slate-400">未實現損益</span><span class="tabular-nums font-medium" :class="profitClass(u.unrealizedProfit)">{{ u.unrealizedProfit > 0 ? '+' : '' }}{{ money(u.unrealizedProfit) }}</span></div>
            <div class="flex justify-between gap-2"><span class="text-slate-400">實現損益</span><span class="tabular-nums font-medium" :class="profitClass(u.realizedProfit)">{{ u.realizedProfit > 0 ? '+' : '' }}{{ money(u.realizedProfit) }}</span></div>
          </div>
        </div>
      </div>
      </template>

      <!-- 分頁 -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
        <p class="text-xs text-slate-400">共 {{ sortedUsers.length }} 個，第 {{ currentPage }} / {{ totalPages }} 頁</p>
        <div class="flex items-center gap-1">
          <button @click="goPage(1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">«</button>
          <button @click="goPage(currentPage - 1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">‹</button>
          <template v-for="p in totalPages" :key="p">
            <button v-if="Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages"
              @click="goPage(p)"
              class="px-3 py-1 text-xs rounded-lg transition font-medium"
              :class="p === currentPage ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
              {{ p }}
            </button>
            <span v-else-if="Math.abs(p - currentPage) === 3" class="px-1 text-slate-300 text-xs">…</span>
          </template>
          <button @click="goPage(currentPage + 1)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">›</button>
          <button @click="goPage(totalPages)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">»</button>
        </div>
      </div>
    </div>
  </div>
</template>
