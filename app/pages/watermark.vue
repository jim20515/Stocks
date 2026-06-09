<script setup lang="ts">
const { data: holdings } = await useFetch<any[]>('/api/stockholdings')
const selected = ref(holdings.value?.[0]?.stock_code ?? '')
const result = ref<any>(null)
const loading = ref(false)
const editAtv = ref('')
const saving = ref(false)
const msg = ref('')

async function loadWatermark() {
  if (!selected.value) return
  loading.value = true
  result.value = null
  try {
    result.value = await $fetch<any>(`/api/portfolio/watermark/${selected.value}`)
    editAtv.value = result.value?.watermarkPrice ?? ''
  } finally {
    loading.value = false
  }
}

async function saveAtv() {
  if (!editAtv.value) return
  saving.value = true
  try {
    await $fetch(`/api/portfolio/watermark/${selected.value}`, {
      method: 'PUT',
      body: Number(editAtv.value),
    })
    msg.value = '水位已更新'
    await loadWatermark()
    setTimeout(() => msg.value = '', 2000)
  } finally {
    saving.value = false
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
      <div class="flex items-center gap-4 flex-wrap">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">選擇持股</label>
          <select v-model="selected" @change="loadWatermark"
            class="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white min-w-40">
            <option v-for="h in holdings" :key="h.id" :value="h.stock_code">
              {{ h.stock_code }} {{ h.stock_name }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">設定歷史最高水位（ATH）</label>
          <div class="flex gap-2">
            <input v-model="editAtv" type="number" step="0.01" placeholder="輸入 ATH 價格"
              class="w-44 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <button @click="saveAtv" :disabled="saving"
              class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              {{ saving ? '儲存中…' : '設定' }}
            </button>
          </div>
        </div>
        <p v-if="msg" class="text-sm text-green-600 font-medium mt-5">✓ {{ msg }}</p>
      </div>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm text-slate-400">載入中…</div>

    <template v-if="result">
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-slate-200">
          <p class="text-xs text-slate-400 mb-1">目前股價</p>
          <p class="text-2xl font-bold text-slate-800">
            {{ result.currentPrice ? result.currentPrice.toLocaleString() : '—' }}
          </p>
        </div>
        <div class="bg-white rounded-xl p-5 border border-slate-200">
          <p class="text-xs text-slate-400 mb-1">歷史最高水位（ATH）</p>
          <p class="text-2xl font-bold text-slate-800">
            {{ result.watermarkPrice ? result.watermarkPrice.toLocaleString() : '未設定' }}
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
        請在上方輸入 ATH 水位後點「設定」，即可查看各百分比對應的點位
      </div>
    </template>
  </div>
</template>
