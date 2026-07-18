<script setup lang="ts">
const { authHeaders } = useAuth()
const { isGuest } = useGuestGate()
const { data: summary } = await useAppData<any>('/api/portfolio/beta-summary', {}, DEMO_BETA)

// 依 stockCode 去重，取唯一持股清單
const holdings = computed(() => {
  const seen = new Set<string>()
  return (summary.value?.items ?? []).filter((h: any) => {
    if (seen.has(h.stockCode)) return false
    seen.add(h.stockCode)
    return true
  })
})

const selected = ref(holdings.value?.[0]?.stockCode ?? '')
const result = ref<any>(null)
const loading = ref(false)

// ── 釘選 + 自訂下拉 ─────────────────────────────────────────
const pinnedCodes = ref<string[]>(
  JSON.parse(typeof localStorage !== 'undefined' ? (localStorage.getItem('pinned_stocks') ?? '[]') : '[]')
)
function togglePin(code: string, e: Event) {
  e.stopPropagation()
  const idx = pinnedCodes.value.indexOf(code)
  if (idx >= 0) pinnedCodes.value.splice(idx, 1)
  else pinnedCodes.value.push(code)
  localStorage.setItem('pinned_stocks', JSON.stringify(pinnedCodes.value))
}
const sortedHoldings = computed(() => {
  return [...holdings.value].sort((a: any, b: any) => {
    const ap = pinnedCodes.value.includes(a.stockCode) ? 0 : 1
    const bp = pinnedCodes.value.includes(b.stockCode) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.stockCode.localeCompare(b.stockCode)
  })
})
const wmSearch = ref('')
const showWmDropdown = ref(false)
const filteredHoldings = computed(() => {
  const q = wmSearch.value.trim().toUpperCase()
  if (!q) return sortedHoldings.value
  return sortedHoldings.value.filter((h: any) =>
    h.stockCode.includes(q) || h.stockName?.toUpperCase().includes(q)
  )
})
function selectHolding(code: string) {
  selected.value = code
  const h = holdings.value.find((h: any) => h.stockCode === code)
  wmSearch.value = h ? `${h.stockCode}　${h.stockName}` : code
  showWmDropdown.value = false
  loadWatermark()
}
function onWmFocus() { wmSearch.value = ''; showWmDropdown.value = true }
function onWmBlur() { setTimeout(() => { showWmDropdown.value = false }, 150) }

// 初始顯示選中的名稱
if (selected.value) {
  const h = holdings.value.find((h: any) => h.stockCode === selected.value)
  if (h) wmSearch.value = `${h.stockCode}　${h.stockName}`
}

async function loadWatermark() {
  if (!selected.value) return
  loading.value = true
  result.value = null
  try {
    // 訪客：用公開水位分析（真實 ATH/現價，不需登入、不需持有）
    result.value = isGuest.value
      ? await $fetch<any>('/api/public/watermark', { query: { code: selected.value } })
      : await $fetch<any>(`/api/portfolio/watermark/${selected.value}`, { headers: authHeaders.value as HeadersInit })
  } finally {
    loading.value = false
  }
}

const drawdownColor = computed(() => {
  if (!result.value?.drawdownPct) return 'text-slate-500'
  return result.value.drawdownPct < 0 ? 'text-red-500' : 'text-green-600'
})

if (selected.value) await loadWatermark()
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <div class="flex flex-wrap items-center gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">選擇持股</label>
          <div class="relative">
            <input
              v-model="wmSearch"
              type="text" placeholder="搜尋代號或名稱…"
              @focus="onWmFocus"
              @blur="onWmBlur"
              class="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white min-w-52"
            />
            <div v-if="showWmDropdown"
              class="absolute z-30 mt-1 w-full min-w-52 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <div v-if="filteredHoldings.length === 0" class="px-3 py-2 text-xs text-slate-400">無符合結果</div>
              <div
                v-for="h in filteredHoldings" :key="h.stockCode"
                class="flex items-center group"
                :class="h.stockCode === selected ? 'bg-indigo-50' : 'hover:bg-slate-50'"
              >
                <button type="button"
                  class="pl-2.5 pr-1 py-2 shrink-0 transition"
                  :class="pinnedCodes.includes(h.stockCode) ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300'"
                  @mousedown.prevent="togglePin(h.stockCode, $event)"
                  title="釘選至最上方">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
                <button type="button"
                  class="flex-1 flex items-center px-2 py-2 text-sm text-left"
                  :class="h.stockCode === selected ? 'text-indigo-600' : 'text-slate-700'"
                  @mousedown.prevent="selectHolding(h.stockCode)">
                  <span class="font-mono font-medium">{{ h.stockCode }}</span>
                  <span v-if="h.stockName" class="ml-2 text-slate-500">{{ h.stockName }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <p class="text-xs text-slate-400 mt-5">歷史最高水位（ATH）自動從 Yahoo Finance 抓取</p>
      </div>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm text-slate-400">載入中…</div>

    <template v-if="result">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-slate-200">
          <p class="text-xs text-slate-400 mb-1">目前股價</p>
          <p class="text-2xl font-bold text-slate-800">
            {{ result.currentPrice ? result.currentPrice.toLocaleString() : '—' }}
          </p>
        </div>
        <div class="bg-white rounded-xl p-5 border border-slate-200">
          <p class="text-xs text-slate-400 mb-1">歷史最高水位（ATH）</p>
          <p class="text-2xl font-bold text-slate-800">
            {{ result.watermarkPrice ? result.watermarkPrice.toLocaleString() : '—' }}
          </p>
        </div>
        <div class="bg-white rounded-xl p-5 border border-slate-200"
          :class="result.drawdownPct < 0 ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-green-400'">
          <p class="text-xs text-slate-400 mb-1">距 ATH 漲跌幅</p>
          <p class="text-2xl font-bold" :class="drawdownColor">
            {{ result.drawdownPct > 0 ? '+' : '' }}{{ result.drawdownPct }}%
          </p>
        </div>
      </div>

      <div v-if="result.watermarkPrice" class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h3 class="text-sm font-semibold text-slate-800">
            {{ result.stockName }}（{{ result.stockCode }}）水位分析
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">以 ATH {{ result.watermarkPrice.toLocaleString() }} 為基準計算</p>
        </div>
        <div class="hidden sm:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">幅度</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-green-600">下跌點位（買入參考）</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">ATH 基準</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-red-500">上漲點位</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="lv in result.levels" :key="lv.pct" class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-indigo-50 text-indigo-700">
                  ±{{ lv.pct }}%
                </span>
              </td>
              <td class="px-5 py-4 text-right">
                <div class="text-green-600 font-bold text-lg">{{ lv.down?.toLocaleString() }}</div>
                <div class="text-xs text-slate-400">-{{ lv.pct }}%</div>
              </td>
              <td class="px-5 py-4 text-right">
                <div class="text-slate-500 font-medium">{{ result.watermarkPrice.toLocaleString() }}</div>
              </td>
              <td class="px-5 py-4 text-right">
                <div class="text-red-500 font-bold text-lg">{{ lv.up?.toLocaleString() }}</div>
                <div class="text-xs text-slate-400">+{{ lv.pct }}%</div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <!-- 手機卡片 -->
        <div class="sm:hidden divide-y divide-slate-100">
          <div v-for="lv in result.levels" :key="lv.pct" class="p-4 flex items-center justify-between gap-3">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-indigo-50 text-indigo-700">±{{ lv.pct }}%</span>
            <div class="flex items-center gap-5">
              <div class="text-right">
                <div class="text-green-600 font-bold text-lg leading-none">{{ lv.down?.toLocaleString() }}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">下跌 -{{ lv.pct }}%</div>
              </div>
              <div class="text-right">
                <div class="text-red-500 font-bold text-lg leading-none">{{ lv.up?.toLocaleString() }}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">上漲 +{{ lv.pct }}%</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="result.currentPrice" class="px-5 py-5 border-t border-slate-100">
          <p class="text-xs font-medium text-slate-500 mb-3">目前位置</p>
          <div class="relative h-6 bg-slate-100 rounded-full overflow-hidden">
            <div v-for="lv in result.levels" :key="'down'+lv.pct"
              class="absolute top-0 bottom-0 w-0.5 bg-green-300"
              :style="{ left: Math.max(0, Math.min(100, ((lv.down - result.levels[result.levels.length-1].down) / (result.levels[0].up - result.levels[result.levels.length-1].down)) * 100)) + '%' }">
            </div>
            <div class="absolute top-0 bottom-0 w-1 bg-indigo-500 rounded-full"
              :style="{ left: Math.max(0, Math.min(97, ((result.currentPrice - result.levels[result.levels.length-1].down) / (result.levels[0].up - result.levels[result.levels.length-1].down)) * 100)) + '%' }">
            </div>
          </div>
          <div class="flex justify-between text-xs text-slate-400 mt-1">
            <span>-{{ result.levels[result.levels.length-1].pct }}% ({{ result.levels[result.levels.length-1].down?.toLocaleString() }})</span>
            <span class="text-indigo-600 font-medium">現價 {{ result.currentPrice.toLocaleString() }}</span>
            <span>+{{ result.levels[0].pct }}% ({{ result.levels[0].up?.toLocaleString() }})</span>
          </div>
        </div>
      </div>

      <div v-else class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        無法取得 ATH 資料
      </div>
    </template>
  </div>
</template>
