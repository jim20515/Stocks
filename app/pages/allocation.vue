<script setup lang="ts">
const refreshKey = useState('portfolioRefreshKey', () => 0)
const { data, refresh } = await useFetch('/api/portfolio/beta-summary', { key: 'beta-summary' })

watch(refreshKey, () => refresh())

const d = computed(() => data.value as any)

function pct(v: any) { return (Number(v) * 100).toFixed(2) + '%' }
function money(v: any) { return Number(v).toLocaleString('zh-TW') }

const betaDiffClass = computed(() => {
  if (!d.value) return ''
  const diff = d.value.betaDiff
  if (Math.abs(diff) < 0.05) return 'text-green-600'
  return diff > 0 ? 'text-red-500' : 'text-amber-500'
})

const leverageLabel: Record<number, string> = { 0: '類現金', 1: '1x 一般', 2: '2x 槓桿' }
const leverageBadge: Record<number, string> = {
  0: 'bg-slate-100 text-slate-500',
  1: 'bg-blue-50 text-blue-600',
  2: 'bg-orange-50 text-orange-600',
}
</script>

<template>
  <div class="space-y-5">
    <div v-if="d" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">總資產</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(d.totalValue) }}</p>
      </div>
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">現金部位</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(d.cash.amount) }}</p>
        <p class="text-xs text-slate-400 mt-0.5">佔比 {{ pct(d.cash.allocation) }}</p>
      </div>
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">目前 Beta</p>
        <p class="text-2xl font-bold text-slate-800">{{ d.currentBeta }}</p>
        <p class="text-xs text-slate-400 mt-0.5">目標 {{ d.targetBeta }}</p>
      </div>
      <div class="bg-white rounded-xl p-5 border border-slate-200"
        :class="Math.abs(d.betaDiff) < 0.05 ? 'border-l-4 border-l-green-400' : 'border-l-4 border-l-amber-400'">
        <p class="text-xs text-slate-400 mb-1">Beta 差異</p>
        <p class="text-2xl font-bold" :class="betaDiffClass">
          {{ d.betaDiff > 0 ? '+' : '' }}{{ d.betaDiff }}
        </p>
        <p class="text-xs mt-0.5" :class="betaDiffClass">
          {{ Math.abs(d.betaDiff) < 0.05 ? '✓ 接近目標' : d.betaDiff > 0 ? '略高於目標' : '略低於目標' }}
        </p>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">資產配置明細</h3>
        <p class="text-xs text-slate-400">Beta = 持股佔比 × 槓桿倍數</p>
      </div>

      <div v-if="!d" class="py-10 text-center text-sm text-slate-400">載入中…</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">代號 / 名稱</th>
              <th class="text-center px-4 py-3 text-xs font-medium text-slate-500">類型</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">股數</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">現價</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">市值</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">佔比</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">槓桿</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">Beta 貢獻</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="h in d.items" :key="h.id" class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                    <span class="text-xs font-bold text-indigo-600">{{ h.stockCode.slice(0,2) }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ h.stockCode }}</p>
                    <p class="text-xs text-slate-400">{{ h.stockName }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-center">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="leverageBadge[h.leverageMultiplier] ?? 'bg-slate-100 text-slate-500'">
                  {{ leverageLabel[h.leverageMultiplier] ?? h.leverageMultiplier + 'x' }}
                </span>
              </td>
              <td class="px-4 py-3.5 text-right text-slate-600">{{ h.shares.toLocaleString() }}</td>
              <td class="px-4 py-3.5 text-right text-slate-700">
                {{ h.currentPrice ? h.currentPrice.toLocaleString() : '—' }}
              </td>
              <td class="px-4 py-3.5 text-right font-medium text-slate-800">{{ money(h.marketValue) }}</td>
              <td class="px-4 py-3.5 text-right text-slate-600">{{ pct(h.allocation) }}</td>
              <td class="px-4 py-3.5 text-right">
                <span class="font-mono font-semibold text-slate-700">{{ h.leverageMultiplier }}x</span>
              </td>
              <td class="px-4 py-3.5 text-right font-mono font-bold text-indigo-600">
                {{ h.betaContrib.toFixed(4) }}
              </td>
            </tr>
            <tr v-if="d.cash.amount > 0" class="bg-slate-50/30 hover:bg-slate-50 transition">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                    <span class="text-xs font-bold text-green-600">現</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">現金</p>
                    <p class="text-xs text-slate-400">Cash</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-center">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">類現金</span>
              </td>
              <td class="px-4 py-3.5 text-right text-slate-400">—</td>
              <td class="px-4 py-3.5 text-right text-slate-400">—</td>
              <td class="px-4 py-3.5 text-right font-medium text-slate-800">{{ money(d.cash.amount) }}</td>
              <td class="px-4 py-3.5 text-right text-slate-600">{{ pct(d.cash.allocation) }}</td>
              <td class="px-4 py-3.5 text-right font-mono font-semibold text-slate-400">0x</td>
              <td class="px-4 py-3.5 text-right font-mono font-bold text-slate-300">0.0000</td>
            </tr>
            <tr class="bg-indigo-50 font-semibold">
              <td class="px-5 py-3 text-slate-700">合計</td>
              <td></td><td></td><td></td>
              <td class="px-4 py-3 text-right text-slate-800">{{ money(d.totalValue) }}</td>
              <td class="px-4 py-3 text-right text-slate-600">100%</td>
              <td></td>
              <td class="px-4 py-3 text-right font-mono text-indigo-700 text-base">{{ d.currentBeta }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
