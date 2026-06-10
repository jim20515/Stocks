<script setup lang="ts">
import { h } from 'vue'

const refreshKey = useState('portfolioRefreshKey', () => 0)
const { data: summary, refresh } = await useAuthFetch('/api/stockholdings/summary', { key: 'dashboard-summary' })

watch(refreshKey, () => refresh())

const icon = (d: string) => () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d })
])

const statCards = computed(() => {
  const s = summary.value as any
  const profit = s?.totalProfit ?? 0
  return [
    {
      label: '總資產', value: s ? '' + (Number(s.totalValue) + Number(s.cashAmount ?? 0)).toLocaleString() : '—',
      icon: icon('M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3'),
      iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', badge: null, badgeClass: '',
    },
    {
      label: '現金部位', value: s ? '' + Number(s.cashAmount ?? 0).toLocaleString() : '—',
      icon: icon('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'),
      iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', badge: null, badgeClass: '',
    },
    {
      label: '總市值', value: s ? '' + Number(s.totalValue).toLocaleString() : '—',
      icon: icon('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'),
      iconBg: 'bg-green-50', iconColor: 'text-green-600', badge: null, badgeClass: '',
    },
    {
      label: '總成本', value: s ? '' + Number(s.totalCost).toLocaleString() : '—',
      icon: icon('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
      iconBg: 'bg-blue-50', iconColor: 'text-blue-600', badge: null, badgeClass: '',
    },
    {
      label: '總損益', value: s ? (profit >= 0 ? '+' : '') + Number(profit).toLocaleString() : '—',
      badge: s ? (s.totalProfitPct >= 0 ? '+' : '') + s.totalProfitPct + '%' : null,
      badgeClass: profit >= 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700',
      icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10'),
      iconBg: profit >= 0 ? 'bg-red-50' : 'bg-green-50',
      iconColor: profit >= 0 ? 'text-red-500' : 'text-green-600',
    },
  ]
})

const allItems = computed(() => (summary.value as any)?.items ?? [])

// 依股票代號加總
const items = computed(() => {
  const map: Record<string, any> = {}
  for (const h of allItems.value) {
    if (!map[h.stockCode]) {
      map[h.stockCode] = { ...h, shares: 0, cost: 0, value: 0, profit: 0 }
    }
    map[h.stockCode].shares += h.shares
    map[h.stockCode].cost += h.cost
    map[h.stockCode].value += h.value
    map[h.stockCode].profit += h.profit
  }
  return Object.values(map)
    .filter(h => h.shares > 0)
    .map(h => ({
      ...h,
      profitPct: h.cost > 0 && h.value > 0 ? Math.round((h.profit / h.cost) * 10000) / 100 : 0,
    }))
})

function pct(h: any) {
  const total = items.value.reduce((s: number, i: any) => s + (i.cost || 0), 0)
  if (!total || !h.cost) return 0
  return Math.round(h.cost / total * 100)
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <div v-for="card in statCards" :key="card.label"
        class="bg-white rounded-xl p-5 border border-slate-200">
        <div class="flex items-start justify-between mb-4">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" :class="card.iconBg">
            <component :is="card.icon" class="w-5 h-5" :class="card.iconColor" />
          </div>
          <span v-if="card.badge" class="text-xs font-medium px-2 py-0.5 rounded-full" :class="card.badgeClass">
            {{ card.badge }}
          </span>
        </div>
        <p class="text-xl font-bold text-slate-800 truncate">{{ card.value }}</p>
        <p class="text-xs text-slate-400 mt-0.5">{{ card.label }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 class="text-sm font-semibold text-slate-800">持股一覽</h3>
          <NuxtLink to="/stocks" class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">管理持股</NuxtLink>
        </div>
        <div v-if="!items.length" class="px-5 py-8 text-center text-sm text-slate-400">
          尚無持股，<NuxtLink to="/stocks" class="text-indigo-600">前往新增</NuxtLink>
        </div>
        <div v-else class="divide-y divide-slate-50">
          <div v-for="h in items" :key="h.id"
            class="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition">
            <div class="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <span class="text-xs font-bold text-indigo-600">{{ h.stockCode.slice(0,2) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800">{{ h.stockName }}</p>
              <p class="text-xs text-slate-400">{{ h.stockCode }} · {{ h.shares.toLocaleString() }} 股</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-sm font-semibold text-slate-800">
                NT$ {{ h.value ? Number(h.value).toLocaleString() : '—' }}
              </p>
              <p class="text-xs font-medium mt-0.5"
                :class="h.profit > 0 ? 'text-red-500' : h.profit < 0 ? 'text-green-600' : 'text-slate-400'">
                <span v-if="h.value">{{ h.profit > 0 ? '+' : '' }}{{ Number(h.profit).toLocaleString() }}
                  ({{ h.profitPct > 0 ? '+' : '' }}{{ h.profitPct }}%)</span>
                <span v-else>待更新</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="bg-white rounded-xl border border-slate-200 p-5">
          <h3 class="text-sm font-semibold text-slate-800 mb-4">持股佔比</h3>
          <div class="space-y-3">
            <div v-for="h in items.slice(0,5)" :key="h.id">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-slate-700">{{ h.stockName }}</span>
                <span class="text-xs font-semibold text-slate-600">{{ pct(h) }}%</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-indigo-400 transition-all duration-700"
                  :style="{ width: pct(h) + '%' }" />
              </div>
            </div>
            <p v-if="!items.length" class="text-xs text-slate-400 text-center py-2">無資料</p>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-5">
          <p class="text-xs font-medium text-slate-500 mb-1">股價資料時間</p>
          <p class="text-sm text-slate-700">{{ (summary as any)?.priceDate || '—' }}</p>
          <p class="text-xs text-slate-400 mt-1">來源：台灣證券交易所</p>
        </div>
      </div>
    </div>
  </div>
</template>
