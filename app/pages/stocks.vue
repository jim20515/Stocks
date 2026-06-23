<script setup lang="ts">
const refreshKey = useState('portfolioRefreshKey', () => 0)
const openEditModal = inject<(h: any) => void>('openEditModal', () => {})
const { authHeaders } = useAuth()

const { data: summary, refresh } = await useAuthFetch('/api/stockholdings/summary', { key: 'stocks-summary' })

watch(refreshKey, () => refresh())

const allItems = computed(() => (summary.value as any)?.items ?? [])
const s = computed(() => summary.value as any)

// 篩選
const filterCode = ref('')
const filterProfitPct = ref<number | ''>('')
const filterTradeType = ref<'all' | 'buy' | 'sell'>('all')
const filterAccount = ref('')

const filteredItems = computed(() => {
  return allItems.value.filter((h: any) => {
    if (filterCode.value && !h.stockCode.toLowerCase().includes(filterCode.value.toLowerCase()) && !h.stockName.includes(filterCode.value)) return false
    if (filterProfitPct.value !== '' && h.profitPct < Number(filterProfitPct.value)) return false
    if (filterTradeType.value === 'buy' && h.shares < 0) return false
    if (filterTradeType.value === 'sell' && h.shares >= 0) return false
    if (filterAccount.value && !(h.account ?? '').includes(filterAccount.value)) return false
    return true
  })
})

function clearFilters() {
  filterCode.value = ''
  filterProfitPct.value = ''
  filterTradeType.value = 'all'
  filterAccount.value = ''
  currentPage.value = 1
}

const hasFilter = computed(() => filterCode.value || filterProfitPct.value !== '' || filterTradeType.value !== 'all' || filterAccount.value)

// 排序
const sortKey = ref<string>('buyDate')
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
  currentPage.value = 1
}

const sortedItems = computed(() => {
  const base = filteredItems.value
  if (!sortKey.value) return base
  return [...base].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'zh-TW') : av - bv
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

// 分頁
const pageSize = 10
const currentPage = ref(1)
const totalPages = computed(() => Math.ceil(sortedItems.value.length / pageSize))
const items = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedItems.value.slice(start, start + pageSize)
})

function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

async function remove(id: number, name: string) {
  if (!confirm(`確定刪除「${name}」？`)) return
  await $fetch(`/api/stockholdings/${id}`, { method: 'DELETE', headers: authHeaders.value as HeadersInit })
  await refresh()
}

async function removeAll() {
  if (!confirm('確定刪除全部交易記錄？此操作無法復原。')) return
  await $fetch('/api/stockholdings/all', { method: 'DELETE', headers: authHeaders.value as HeadersInit })
  await refresh()
}

function money(v: any) { return Number(v).toLocaleString('zh-TW') }

const refreshing = ref(false)
async function refreshPrices() {
  refreshing.value = true
  try { await refresh() } finally { refreshing.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div v-if="s" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-white rounded-xl p-3 sm:p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">總成本</p>
        <p class="text-sm sm:text-xl font-bold text-slate-800 truncate">{{ money(s.totalCost) }}</p>
      </div>
      <div class="bg-white rounded-xl p-3 sm:p-5 border border-slate-200"
        :class="s.dailyChange > 0 ? 'border-l-4 border-l-red-400' : s.dailyChange < 0 ? 'border-l-4 border-l-green-500' : ''">
        <p class="text-xs text-slate-400 mb-1">總市值</p>
        <p class="text-sm sm:text-xl font-bold text-slate-800 truncate">{{ money(s.totalValue) }}</p>
        <p v-if="s.dailyChangePct != null" class="text-xs font-medium mt-0.5"
          :class="s.dailyChange > 0 ? 'text-red-500' : s.dailyChange < 0 ? 'text-green-600' : 'text-slate-400'">
          今日 {{ s.dailyChange > 0 ? '+' : '' }}{{ money(s.dailyChange) }}（{{ s.dailyChangePct > 0 ? '+' : '' }}{{ s.dailyChangePct }}%）
        </p>
      </div>
      <div class="bg-white rounded-xl p-3 sm:p-5 border border-slate-200"
        :class="s.totalProfit >= 0 ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-green-500'">
        <p class="text-xs text-slate-400 mb-1">未實現損益</p>
        <p class="text-sm sm:text-xl font-bold truncate" :class="s.totalProfit >= 0 ? 'text-red-500' : 'text-green-600'">
          {{ s.totalProfit >= 0 ? '+' : '' }}{{ money(s.totalProfit) }}
        </p>
        <p class="text-xs font-medium mt-0.5" :class="s.totalProfit >= 0 ? 'text-red-400' : 'text-green-500'">
          {{ s.totalProfitPct >= 0 ? '+' : '' }}{{ s.totalProfitPct }}%
        </p>
      </div>
      <div class="bg-white rounded-xl p-3 sm:p-5 border border-slate-200"
        :class="(s.totalRealizedProfit ?? 0) >= 0 ? 'border-l-4 border-l-red-300' : 'border-l-4 border-l-green-400'">
        <p class="text-xs text-slate-400 mb-1">實現損益</p>
        <p class="text-sm sm:text-xl font-bold truncate"
          :class="(s.totalRealizedProfit ?? 0) >= 0 ? 'text-red-500' : 'text-green-600'">
          {{ (s.totalRealizedProfit ?? 0) >= 0 ? '+' : '' }}{{ money(s.totalRealizedProfit ?? 0) }}
        </p>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <!-- 篩選列 -->
      <div class="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-slate-100">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">代號 / 名稱</label>
          <input v-model="filterCode" type="text" placeholder="搜尋…" @input="currentPage = 1"
            class="w-32 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">損益% 大於</label>
          <div class="flex items-center gap-1">
            <input v-model.number="filterProfitPct" type="number" placeholder="例：10" @input="currentPage = 1"
              class="w-24 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <span class="text-sm text-slate-400">%</span>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">帳戶</label>
          <input v-model="filterAccount" type="text" placeholder="搜尋帳戶…" @input="currentPage = 1"
            class="w-28 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">交易類型</label>
          <div class="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <button @click="filterTradeType = 'all'; currentPage = 1"
              :class="filterTradeType === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'"
              class="px-3 py-1.5 transition">全部</button>
            <button @click="filterTradeType = 'buy'; currentPage = 1"
              :class="filterTradeType === 'buy' ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-50'"
              class="px-3 py-1.5 border-l border-slate-200 transition">買進</button>
            <button @click="filterTradeType = 'sell'; currentPage = 1"
              :class="filterTradeType === 'sell' ? 'bg-green-500 text-white' : 'text-slate-500 hover:bg-slate-50'"
              class="px-3 py-1.5 border-l border-slate-200 transition">賣出</button>
          </div>
        </div>
        <button v-if="hasFilter" @click="clearFilters"
          class="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
          清除篩選
        </button>
        <span v-if="hasFilter" class="text-xs text-slate-400">共 {{ sortedItems.length }} 筆</span>
      </div>

      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">交易明細</h3>
        <div class="flex items-center gap-2">
          <button @click="removeAll"
            class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            全部刪除
          </button>
          <div class="relative group">
            <button @click="refreshPrices" :disabled="refreshing"
              class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition">
              <svg :class="refreshing ? 'animate-spin' : ''" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              更新股價
            </button>
            <div class="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block bg-slate-800 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
              更新所有交易明細的現價
            </div>
          </div>
          <div class="relative group">
            <button @click="refreshPrices" :disabled="refreshing"
              class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-500 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              重新計算成本
            </button>
            <div class="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block bg-slate-800 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
              當交易記錄更改帳戶時，需要重新計算成本
            </div>
          </div>
          <p class="text-xs text-slate-400">股價來源：{{ s?.priceDate || '—' }}</p>
        </div>
      </div>

      <div v-if="!allItems.length" class="py-12 text-center text-sm text-slate-400">
        尚無交易，點右上角「新增交易」開始記錄
      </div>
      <div v-else class="overflow-x-auto" >
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('stockCode')">
                代號 / 名稱
                <span class="ml-1 opacity-50">{{ sortKey === 'stockCode' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-center px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('leverageMultiplier')">
                類型
                <span class="ml-1 opacity-50">{{ sortKey === 'leverageMultiplier' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('shares')">
                交易股數
                <span class="ml-1 opacity-50">{{ sortKey === 'shares' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('averageCost')">
                均成本
                <span class="ml-1 opacity-50">{{ sortKey === 'averageCost' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('currentPrice')">
                現價
                <span class="ml-1 opacity-50">{{ sortKey === 'currentPrice' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('cost')">
                成本總額
                <span class="ml-1 opacity-50">{{ sortKey === 'cost' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('value')">
                市值
                <span class="ml-1 opacity-50">{{ sortKey === 'value' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('profit')">
                損益
                <span class="ml-1 opacity-50">{{ sortKey === 'profit' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('profitPct')">
                損益%
                <span class="ml-1 opacity-50">{{ sortKey === 'profitPct' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('buyDate')">
                交易日
                <span class="ml-1 opacity-50">{{ sortKey === 'buyDate' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="h in items" :key="h.id"
              :class="h.leverageMultiplier === 0 ? 'bg-green-50/30 hover:bg-green-50/50' : 'hover:bg-slate-50/50'"
              class="transition">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    :class="h.leverageMultiplier === 0 ? 'bg-green-50' : 'bg-indigo-50'">
                    <span class="text-xs font-bold"
                      :class="h.leverageMultiplier === 0 ? 'text-green-600' : 'text-indigo-600'">
                      {{ h.stockCode.slice(0,2) }}
                    </span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ h.stockCode }}</p>
                    <p class="text-xs text-slate-400">{{ h.stockName }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-center">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="h.leverageMultiplier === 0 ? 'bg-green-50 text-green-600' : h.leverageMultiplier === 2 ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'">
                  {{ h.leverageMultiplier === 0 ? '類現金' : h.leverageMultiplier + 'x' }}
                </span>
              </td>
              <td class="px-4 py-3.5 text-right"
                :class="h.shares < 0 ? 'text-green-600 font-medium' : 'text-slate-700'">
                {{ Math.abs(h.shares).toLocaleString() }}{{ h.shares < 0 ? ' (賣)' : '' }}
              </td>
              <!-- 均成本：賣出行顯示當時 WACC，買入行顯示買入均價 -->
              <td class="px-4 py-3.5 text-right text-slate-700">
                {{ h.shares < 0 ? (h.costBasis ?? h.averageCost).toLocaleString() : h.averageCost.toLocaleString() }}
              </td>
              <!-- 現價：賣出行顯示賣出價 -->
              <td class="px-4 py-3.5 text-right">
                <span class="font-medium text-slate-800">
                  {{ h.shares < 0 ? h.averageCost.toLocaleString() : (h.currentPrice ? h.currentPrice.toLocaleString() : '—') }}
                </span>
              </td>
              <!-- 成本總額：賣出行顯示成本基礎金額 -->
              <td class="px-4 py-3.5 text-right text-slate-600">
                {{ h.shares < 0 ? money(Math.round((h.costBasis ?? h.averageCost) * Math.abs(h.shares))) : money(h.cost) }}
              </td>
              <!-- 市值：賣出行 = 賣出價 × 股數 -->
              <td class="px-4 py-3.5 text-right font-medium text-slate-800">
                {{ h.shares < 0 ? money(Math.round(h.averageCost * Math.abs(h.shares))) : (h.value ? money(h.value) : '—') }}
              </td>
              <!-- 損益 -->
              <td class="px-4 py-3.5 text-right font-semibold"
                :class="h.profit > 0 ? 'text-red-500' : h.profit < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ h.profit > 0 ? '+' : '' }}{{ money(h.profit) }}
              </td>
              <!-- 損益% -->
              <td class="px-4 py-3.5 text-right">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="h.profitPct > 0 ? 'bg-red-50 text-red-600' : h.profitPct < 0 ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'">
                  {{ h.profitPct > 0 ? '+' : '' }}{{ h.profitPct }}%
                </span>
              </td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">
                {{ h.buyDate }}
                <span v-if="h.account" class="block mt-0.5 text-indigo-400">{{ h.account }}</span>
              </td>
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-2 justify-end">
                  <button @click="openEditModal(h)"
                    class="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button @click="remove(h.id, h.stockName)"
                    class="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      <!-- 分頁 -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
        <p class="text-xs text-slate-400">
          共 {{ allItems.length }} 筆，第 {{ currentPage }} / {{ totalPages }} 頁
        </p>
        <div class="flex items-center gap-1">
          <button @click="goPage(1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            «
          </button>
          <button @click="goPage(currentPage - 1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            ‹
          </button>
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
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            ›
          </button>
          <button @click="goPage(totalPages)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            »
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
