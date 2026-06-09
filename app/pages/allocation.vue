<script setup lang="ts">
const refreshKey = useState('portfolioRefreshKey', () => 0)
const { authHeaders } = useAuth()
const { data, refresh } = await useFetch('/api/portfolio/beta-summary', { key: 'beta-summary', headers: authHeaders })

watch(refreshKey, () => refresh())

const d = computed(() => data.value as any)

// 目標配置表單
const form = ref({ x1: 70, x2: 20, cash: '' })
const saving = ref(false)
const msg = ref('')

// 從 API 載入目標值與現金
watch(d, (val) => {
  if (val?.targetAlloc) {
    form.value.x1 = val.targetAlloc.x1
    form.value.x2 = val.targetAlloc.x2
  }
  if (val?.cash?.amount != null && form.value.cash === '') {
    form.value.cash = String(val.cash.amount)
  }
}, { immediate: true })

const target0x = computed(() => Math.max(0, 100 - form.value.x1 - form.value.x2))
const formInvalid = computed(() => form.value.x1 + form.value.x2 > 100)

async function saveTargets() {
  if (formInvalid.value) return
  saving.value = true
  try {
    const settings = await $fetch<any>('/api/portfolio/settings', { headers: authHeaders.value })
    await $fetch('/api/portfolio/settings', {
      method: 'PUT',
      headers: authHeaders.value,
      body: { ...settings, targetAlloc1x: form.value.x1, targetAlloc2x: form.value.x2, cashAmount: Number(String(form.value.cash).replace(/,/g, '')) },
    })
    await refresh()
    msg.value = '已儲存'
    setTimeout(() => msg.value = '', 2000)
  } finally {
    saving.value = false
  }
}

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

function diffClass(actual: number, target: number) {
  return actual >= target ? 'text-green-600' : 'text-red-500'
}

function barClass(actual: number, target: number) {
  return actual >= target ? 'bg-green-400' : 'bg-red-400'
}
</script>

<template>
  <div class="space-y-5">
    <!-- 目標配置設定 -->
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="text-sm font-semibold text-slate-800 mb-4">目標配置設定</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">1倍槓桿目標（%）</label>
          <input v-model.number="form.x1" type="number" min="0" max="100" step="1"
            class="w-32 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">2倍槓桿目標（%）</label>
          <input v-model.number="form.x2" type="number" min="0" max="100" step="1"
            class="w-32 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">0倍槓桿（類現金）目標（%）</label>
          <div class="w-32 px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-500 font-medium">
            {{ target0x }}%
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">現金部位（元）</label>
          <input
            :value="form.cash !== '' ? Number(form.cash).toLocaleString('zh-TW') : ''"
            type="text" inputmode="numeric" placeholder="例：3,500,000"
            @focus="(e: any) => { e.target.value = String(form.cash) }"
            @blur="(e: any) => { const n = Number(e.target.value.replace(/,/g,'')); if (!isNaN(n)) { form.cash = String(n); e.target.value = n.toLocaleString('zh-TW') } }"
            class="w-40 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div class="flex items-center gap-3">
          <button @click="saveTargets" :disabled="saving || formInvalid"
            class="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {{ saving ? '儲存中…' : '套用' }}
          </button>
          <span v-if="formInvalid" class="text-xs text-red-500">1x + 2x 不可超過 100%</span>
          <span v-else-if="msg" class="text-sm text-green-600 font-medium">✓ {{ msg }}</span>
        </div>
      </div>
    </div>

    <!-- 目前 vs 目標 概覽 -->
    <div v-if="d" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">總資產</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(d.totalValue) }}</p>
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
      <div class="bg-white rounded-xl p-5 border border-slate-200">
        <p class="text-xs text-slate-400 mb-1">現金部位</p>
        <p class="text-xl font-bold text-slate-800">NT$ {{ money(d.cash.amount) }}</p>
        <p class="text-xs text-slate-400 mt-0.5">佔比 {{ pct(d.cash.allocation) }}</p>
      </div>
    </div>

    <!-- 槓桿類型 目前 vs 目標 比較表 -->
    <div v-if="d?.actualAlloc" class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">槓桿配置 目前 vs 目標</h3>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-100">
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">類型</th>
            <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">目前佔比</th>
            <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">目標佔比</th>
            <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">差距</th>
            <th class="px-5 py-3 w-48"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">
          <tr v-for="row in [
            { label: '1x 一般', badge: 'bg-blue-50 text-blue-600',    actual: d.actualAlloc.x1, target: d.targetAlloc.x1 },
            { label: '2x 槓桿', badge: 'bg-orange-50 text-orange-600', actual: d.actualAlloc.x2, target: d.targetAlloc.x2 },
            { label: '0x 類現金', badge: 'bg-slate-100 text-slate-500', actual: d.actualAlloc.x0, target: d.targetAlloc.x0 },
          ]" :key="row.label" class="hover:bg-slate-50/50 transition">
            <td class="px-5 py-3.5">
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" :class="row.badge">
                {{ row.label }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-right font-semibold text-slate-800">{{ row.actual.toFixed(1) }}%</td>
            <td class="px-5 py-3.5 text-right text-slate-500">{{ row.target.toFixed(1) }}%</td>
            <td class="px-5 py-3.5 text-right font-semibold" :class="diffClass(row.actual, row.target)">
              {{ (row.actual - row.target) > 0 ? '+' : '' }}{{ (row.actual - row.target).toFixed(1) }}%
            </td>
            <td class="px-5 py-3.5">
              <div class="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                <!-- 目標線 -->
                <div class="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10"
                  :style="{ left: Math.min(row.target, 99) + '%' }" />
                <!-- 實際進度條 -->
                <div class="h-full rounded-full transition-all duration-500"
                  :class="barClass(row.actual, row.target)"
                  :style="{ width: Math.min(row.actual, 100) + '%' }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 持股配置明細 -->
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
