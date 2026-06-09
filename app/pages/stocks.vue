<script setup lang="ts">
const refreshKey = useState('portfolioRefreshKey', () => 0)
const openEditModal = inject<(h: any) => void>('openEditModal', () => {})
const { authHeaders } = useAuth()

const { data: summary, refresh } = await useFetch('/api/stockholdings/summary', { key: 'stocks-summary', headers: authHeaders })

watch(refreshKey, () => refresh())

const items = computed(() => (summary.value as any)?.items ?? [])
const s = computed(() => summary.value as any)

async function remove(id: number, name: string) {
  if (!confirm(`確定刪除「${name}」？`)) return
  await $fetch(`/api/stockholdings/${id}`, { method: 'DELETE', headers: authHeaders.value })
  await refresh()
}

function money(v: any) { return Number(v).toLocaleString('zh-TW') }
</script>

<template>
  <div class="space-y-5">
    <div v-if="s" class="grid grid-cols-3 gap-4">
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">總成本</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(s.totalCost) }}</p>
      </div>
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">總市值</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(s.totalValue) }}</p>
      </div>
      <div class="bg-white rounded-xl p-5 border border-slate-200"
        :class="s.totalProfit >= 0 ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-green-500'">
        <p class="text-xs text-slate-400 mb-1">總損益</p>
        <p class="text-xl font-bold" :class="s.totalProfit >= 0 ? 'text-red-500' : 'text-green-600'">
          {{ s.totalProfit >= 0 ? '+' : '' }}NT$ {{ money(s.totalProfit) }}
          <span class="text-sm font-medium ml-1">({{ s.totalProfitPct >= 0 ? '+' : '' }}{{ s.totalProfitPct }}%)</span>
        </p>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">持股明細</h3>
        <p class="text-xs text-slate-400">股價來源：{{ s?.priceDate || '—' }}</p>
      </div>

      <div v-if="!items.length" class="py-12 text-center text-sm text-slate-400">
        尚無持股，點右上角「新增持股」開始記錄
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">代號 / 名稱</th>
              <th class="text-center px-4 py-3 text-xs font-medium text-slate-500">類型</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">持有股數</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">均成本</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">現價</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">成本總額</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">市值</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">損益</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">損益%</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">買入日</th>
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
              <td class="px-4 py-3.5 text-right text-slate-700">{{ h.shares.toLocaleString() }}</td>
              <td class="px-4 py-3.5 text-right text-slate-700">{{ h.averageCost.toLocaleString() }}</td>
              <td class="px-4 py-3.5 text-right">
                <span v-if="h.currentPrice" class="font-medium text-slate-800">{{ h.currentPrice.toLocaleString() }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-4 py-3.5 text-right text-slate-600">{{ money(h.cost) }}</td>
              <td class="px-4 py-3.5 text-right">
                <span v-if="h.value" class="font-medium text-slate-800">{{ money(h.value) }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-4 py-3.5 text-right font-semibold"
                :class="h.profit > 0 ? 'text-red-500' : h.profit < 0 ? 'text-green-600' : 'text-slate-400'">
                <span v-if="h.value">{{ h.profit > 0 ? '+' : '' }}{{ money(h.profit) }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-4 py-3.5 text-right">
                <span v-if="h.value"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="h.profitPct > 0 ? 'bg-red-50 text-red-600' : h.profitPct < 0 ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'">
                  {{ h.profitPct > 0 ? '+' : '' }}{{ h.profitPct }}%
                </span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">{{ h.buyDate }}</td>
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
    </div>
  </div>
</template>
