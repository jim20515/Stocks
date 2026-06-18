<script setup lang="ts">
const route = useRoute()
const { user, clearSession, authHeaders } = useAuth()
const { $authFetch } = useNuxtApp()
const sidebarOpen = ref(false)
watch(route, () => { sidebarOpen.value = false })

// ── XLS 匯入 ──────────────────────────────────────────────
const xlsFileInput = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importPreview = ref<any[]>([])
const importing = ref(false)

function triggerImport() {
  xlsFileInput.value?.click()
}

async function onXlsSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(e.target as HTMLInputElement).value = ''

  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null })

  // 只保留有效交易記錄
  const txns = rows.filter(r => r['交易類別'] && r['股票名稱'] && r['成交股數'] && r['成交單價'])

  // 從股票名稱解析代號，例如 富邦NASDAQ(00662) → 00662
  function extractCode(name: string) {
    const m = name.match(/\(([^)]+)\)/)
    return m ? m[1] : name
  }

  // 每一筆交易記錄獨立匯入
  importPreview.value = txns.map(r => {
    const name = r['股票名稱']
    const type = r['交易類別']
    const shares = Number(r['成交股數'])
    const price = Number(r['成交單價'])
    const dateRaw = r['成交日期']
    const dateStr = dateRaw instanceof Date
      ? dateRaw.toISOString().slice(0, 10)
      : String(dateRaw).slice(0, 10)
    // 賣出記錄用負股數表示
    const finalShares = (type === '現股賣出') ? -shares : shares
    const code = extractCode(name)
    const leverageMultiplier = code.endsWith('L') ? 2 : code.endsWith('B') ? 0 : 1
    return {
      stockCode: code,
      stockName: name.replace(/\([^)]*\)/, '').trim(),
      shares: finalShares,
      averageCost: price,
      buyDate: dateStr,
      tradeType: type,
      leverageMultiplier,
    }
  })

  showImportModal.value = true
}

async function confirmImport() {
  importing.value = true
  try {
    await ($authFetch as any)('/api/stockholdings/import', {
      method: 'POST',
      body: { items: importPreview.value },
    })
    refreshKey.value++
    showImportModal.value = false
  } finally {
    importing.value = false
  }
}

// ──────────────────────────────────────────────────────────
const showModal = ref(false)
const editingId = ref<number | null>(null)
const lookingUp = ref(false)
const lookupError = ref('')

const form = ref({ stockCode: '', stockName: '', shares: '', averageCost: '', costBasis: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy' as 'buy' | 'sell' })

const refreshKey = useState('portfolioRefreshKey', () => 0)

provide('refreshKey', refreshKey)
provide('openEditModal', (holding: any) => {
  editingId.value = holding.id
  const isSell = holding.shares < 0
  form.value = {
    stockCode: holding.stockCode,
    stockName: holding.stockName,
    shares: String(Math.abs(holding.shares)),
    averageCost: holding.averageCost,
    costBasis: holding.costBasis ? String(holding.costBasis) : '',
    buyDate: holding.buyDate,
    leverageMultiplier: holding.leverageMultiplier ?? 1,
    watermarkPrice: holding.watermarkPrice ?? '',
    tradeType: isSell ? 'sell' : 'buy',
  }
  lookupError.value = ''
  showModal.value = true
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function openModal() {
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
  form.value = { stockCode: '', stockName: '', shares: '', averageCost: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy' }
  lookupError.value = ''
}

async function logout() {
  clearSession()
  await navigateTo('/login')
}

function inferLeverage(code: string): number {
  const upper = code.trim().toUpperCase()
  if (upper.endsWith('L')) return 2
  if (upper.endsWith('B')) return 0
  return 1
}

async function onCodeBlur() {
  const code = form.value.stockCode.trim()
  if (!code) return
  lookupError.value = ''
  form.value.leverageMultiplier = inferLeverage(code)
  lookingUp.value = true
  try {
    const data = await ($authFetch as any)<any>(`/api/stockholdings/lookup/${code}`)
    form.value.stockName = data.name
    if (form.value.tradeType === 'sell') {
      // 賣出：averageCost 存賣出價（市價）；costBasis 另外查 WACC 顯示參考
      if (data.price) form.value.averageCost = data.price
      const summary = await ($authFetch as any)<any>('/api/stockholdings/summary')
      const holdings: any[] = summary?.items ?? []
      const buyLots = holdings.filter((h: any) => h.stockCode.toUpperCase() === code.toUpperCase() && h.shares > 0)
      const totalShares = buyLots.reduce((s: number, h: any) => s + h.shares, 0)
      const totalCost = buyLots.reduce((s: number, h: any) => s + h.averageCost * h.shares, 0)
      form.value.costBasis = totalShares > 0 ? String(Math.round(totalCost / totalShares * 100) / 100) : ''
    } else {
      if (data.price) form.value.averageCost = data.price
      form.value.costBasis = ''
    }
  } catch {
    lookupError.value = '查無此代號'
  } finally {
    lookingUp.value = false
  }
}

async function submitForm() {
  if (!form.value.stockCode || !form.value.shares || !form.value.averageCost) return
  const payload = {
    stockCode: form.value.stockCode.trim(),
    stockName: form.value.stockName.trim() || form.value.stockCode.trim(),
    shares: form.value.tradeType === 'sell' ? -Math.abs(Number(form.value.shares)) : Math.abs(Number(form.value.shares)),
    averageCost: Number(form.value.averageCost),
    buyDate: form.value.buyDate,
    leverageMultiplier: Number(form.value.leverageMultiplier),
    watermarkPrice: form.value.watermarkPrice ? Number(form.value.watermarkPrice) : null,
  }
  if (editingId.value) {
    await ($authFetch as any)(`/api/stockholdings/${editingId.value}`, { method: 'PUT', body: payload })
  } else {
    await ($authFetch as any)('/api/stockholdings', { method: 'POST', body: payload })
  }
  refreshKey.value++
  closeModal()
}

</script>

<template>
  <div class="min-h-screen bg-slate-50 flex">
    <!-- 手機遮罩 -->
    <div v-if="sidebarOpen" class="fixed inset-0 bg-black/40 z-30 md:hidden" @click="sidebarOpen = false" />

    <LayoutSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="md:ml-60 flex-1 flex flex-col min-h-screen overflow-x-hidden">
      <LayoutAppHeader @add="openModal" @import="triggerImport" @logout="logout" @menu="sidebarOpen = true" />
      <main class="flex-1 p-4 md:p-6">
        <slot />
      </main>
    </div>

    <!-- 隱藏的 XLS 檔案輸入 -->
    <input ref="xlsFileInput" type="file" accept=".xls,.xlsx" class="hidden" @change="onXlsSelected" />

    <!-- XLS 匯入預覽 Modal -->
    <Transition name="fade">
      <div v-if="showImportModal"
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        @click.self="showImportModal = false">
        <div class="bg-white rounded-2xl w-full max-w-3xl shadow-xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
            <div>
              <h2 class="text-base font-semibold text-slate-800">匯入 XLS 預覽</h2>
              <p class="text-xs text-slate-400 mt-0.5">已從交易記錄計算出以下持股，確認後將新增到你的帳戶</p>
            </div>
            <button @click="showImportModal = false" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="overflow-auto flex-1">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-slate-50">
                <tr class="border-b border-slate-100">
                  <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">日期</th>
                  <th class="text-center px-4 py-3 text-xs font-medium text-slate-500">類別</th>
                  <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">代號</th>
                  <th class="text-left px-4 py-3 text-xs font-medium text-slate-500">名稱</th>
                  <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">股數</th>
                  <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">成交單價</th>
                  <th class="text-center px-4 py-3 text-xs font-medium text-slate-500">槓桿類型</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="(h, i) in importPreview" :key="i"
                  :class="h.shares < 0 ? 'bg-green-50/40' : 'hover:bg-slate-50/50'">
                  <td class="px-5 py-2.5 text-slate-500 text-xs">{{ h.buyDate }}</td>
                  <td class="px-4 py-2.5 text-center">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="h.shares < 0 ? 'bg-green-50 text-green-700' : 'bg-indigo-50 text-indigo-600'">
                      {{ h.tradeType }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 font-semibold text-indigo-600">{{ h.stockCode }}</td>
                  <td class="px-4 py-2.5 text-slate-700">{{ h.stockName }}</td>
                  <td class="px-4 py-2.5 text-right"
                    :class="h.shares < 0 ? 'text-green-700 font-medium' : 'text-slate-700'">
                    {{ Math.abs(h.shares).toLocaleString() }}
                  </td>
                  <td class="px-4 py-2.5 text-right text-slate-700">{{ h.averageCost.toLocaleString() }}</td>
                  <td class="px-4 py-2.5 text-center">
                    <select v-model="h.leverageMultiplier"
                      class="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white">
                      <option :value="1">1x 一般</option>
                      <option :value="2">2x 槓桿</option>
                      <option :value="0">類現金</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button @click="showImportModal = false"
              class="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              取消
            </button>
            <button @click="confirmImport" :disabled="importing"
              class="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              {{ importing ? '匯入中…' : `確認匯入 ${importPreview.length} 筆持股` }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 新增 / 編輯交易 Modal -->
    <Transition name="fade">
      <div v-if="showModal"
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        @click.self="closeModal">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-xl">
          <div class="flex items-center justify-between p-6 border-b border-slate-100">
            <h2 class="text-base font-semibold text-slate-800">{{ editingId ? '編輯交易' : '新增交易' }}</h2>
            <button @click="closeModal" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 交易表單 -->
          <div class="p-6 space-y-4">
            <!-- 買入 / 賣出切換 -->
            <div class="flex gap-2">
              <button @click="form.tradeType = 'buy'"
                :class="form.tradeType === 'buy' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
                class="flex-1 py-2 text-sm font-semibold rounded-lg border transition">
                買入
              </button>
              <button @click="form.tradeType = 'sell'"
                :class="form.tradeType === 'sell' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'"
                class="flex-1 py-2 text-sm font-semibold rounded-lg border transition">
                賣出
              </button>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
              <input v-model="form.stockCode" type="text" placeholder="例：2330"
                @blur="onCodeBlur" @input="lookupError = ''"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">
                股票名稱
                <span v-if="lookingUp" class="ml-2 text-slate-400 font-normal">查詢中…</span>
                <span v-else-if="lookupError" class="ml-2 text-red-500 font-normal">{{ lookupError }}</span>
              </label>
              <input v-model="form.stockName" type="text" placeholder="輸入代號後自動帶入"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1.5">交易股數</label>
                <input v-model="form.shares" type="number" min="1" placeholder="例：1000（1張）"
                  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1.5">
                  {{ form.tradeType === 'sell' ? '賣出價格（每股）' : '平均成本（每股）' }}
                  <span v-if="form.tradeType === 'sell' && form.costBasis" class="ml-1 font-normal text-slate-400">均成本 {{ Number(form.costBasis).toLocaleString('zh-TW') }}</span>
                  <span v-else-if="form.averageCost && !editingId" class="ml-1 font-normal text-indigo-400">← 已帶入現價</span>
                </label>
                <input
                  :value="form.averageCost !== '' ? Number(form.averageCost).toLocaleString('zh-TW') : ''"
                  type="text" inputmode="decimal" placeholder="輸入代號後自動帶入"
                  @focus="(e: any) => { e.target.value = String(form.averageCost).replace(/,/g, '') }"
                  @blur="(e: any) => { const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) form.averageCost = String(n) }"
                  @input="(e: any) => { form.averageCost = e.target.value.replace(/,/g, '') }"
                  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">持股類型</label>
              <select v-model="form.leverageMultiplier"
                disabled
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400 cursor-not-allowed">
                <option :value="1">1x 一般（Beta 貢獻 ×1）</option>
                <option :value="2">2x 槓桿（Beta 貢獻 ×2）</option>
                <option :value="0">類現金（Beta 貢獻 0）</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">交易日期</label>
              <input v-model="form.buyDate" type="date"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          <div class="flex gap-3 px-6 pb-6">
            <button @click="closeModal"
              class="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              取消
            </button>
            <button @click="submitForm()"
              class="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition"
              :class="form.tradeType === 'sell' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'">
              {{ editingId ? '儲存變更' : '新增交易' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
