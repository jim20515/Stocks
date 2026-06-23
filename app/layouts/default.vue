<script setup lang="ts">
const route = useRoute()
const { user, clearSession, authHeaders } = useAuth()
const { $authFetch } = useNuxtApp()
const sidebarOpen = ref(false)
watch(route, () => { sidebarOpen.value = false })

// ── XLS 匯入 ──────────────────────────────────────────────
const xlsFileInput = ref<HTMLInputElement | null>(null)
const showBrokerModal = ref(false)
const showImportModal = ref(false)
const importPreview = ref<any[]>([])
const importing = ref(false)
const pendingFile = ref<File | null>(null)
const importFilterCodes = ref<Set<string>>(new Set())
const importAccount = ref('')

function triggerImport() {
  xlsFileInput.value?.click()
}

async function onXlsSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(e.target as HTMLInputElement).value = ''
  pendingFile.value = file
  showBrokerModal.value = true
}

async function parseAsFubon() {
  const file = pendingFile.value
  if (!file) return
  showBrokerModal.value = false

  const text = await file.text()
  const isHtml = text.trimStart().startsWith('<')

  function extractCode(name: string) {
    const m = name.match(/\(([^)]+)\)/)
    return m ? m[1] : name
  }

  function toDate(s: string) {
    return s.replace(/\//g, '-').slice(0, 10)
  }

  let rows: { date: string; type: string; name: string; shares: number; price: number }[] = []

  if (isHtml) {
    // 富邦 HTML 偽裝 XLS：直接用 DOMParser 解析
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const trs = doc.querySelectorAll('tr')
    trs.forEach((tr, i) => {
      if (i === 0) return // 略過標題行
      const tds = tr.querySelectorAll('td')
      if (tds.length < 5) return
      const date = tds[0].textContent?.trim() ?? ''
      const type = tds[1].textContent?.trim() ?? ''
      const name = tds[2].textContent?.trim() ?? ''
      const shares = parseFloat((tds[3].textContent ?? '').replace(/,/g, ''))
      const price = parseFloat((tds[4].textContent ?? '').replace(/,/g, ''))
      if (!date || !name || isNaN(shares) || isNaN(price)) return
      rows.push({ date, type, name, shares, price })
    })
  } else {
    // 一般 XLSX 格式
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null })
    rows = raw
      .filter(r => r['交易類別'] && r['股票名稱'] && r['成交股數'] && r['成交單價'])
      .map(r => ({
        date: r['成交日期'] instanceof Date ? r['成交日期'].toISOString().slice(0, 10) : String(r['成交日期']),
        type: r['交易類別'],
        name: r['股票名稱'],
        shares: Number(r['成交股數']),
        price: Number(r['成交單價']),
      }))
  }

  importPreview.value = rows.map(r => {
    const finalShares = r.type === '現股賣出' ? -r.shares : r.shares
    const code = extractCode(r.name)
    const leverageMultiplier = code.endsWith('L') ? 2 : code.endsWith('B') ? 0 : 1
    return {
      stockCode: code,
      stockName: r.name.replace(/\([^)]*\)/, '').trim(),
      shares: finalShares,
      averageCost: r.price,
      buyDate: toDate(r.date),
      tradeType: r.type,
      leverageMultiplier,
    }
  })

  importFilterCodes.value = new Set(importPreview.value.map((r: any) => r.stockCode))
  importAccount.value = ''
  showImportModal.value = true
}

async function confirmImport() {
  importing.value = true
  try {
    const filtered = importPreview.value
      .filter((r: any) => importFilterCodes.value.has(r.stockCode))
      .map((r: any) => ({ ...r, account: importAccount.value || null }))
    await ($authFetch as any)('/api/stockholdings/import', {
      method: 'POST',
      body: { items: filtered },
    })
    refreshKey.value++
    showImportModal.value = false
  } finally {
    importing.value = false
  }
}

// ── 帳戶別名 ──────────────────────────────────────────────
const { data: accountList } = await useAuthFetch<{ id: number; name: string }[]>('/api/accounts')

// ──────────────────────────────────────────────────────────
const showModal = ref(false)
const editingId = ref<number | null>(null)
const lookingUp = ref(false)
const lookupError = ref('')

const form = ref({ stockCode: '', stockName: '', shares: '', averageCost: '', costBasis: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy' as 'buy' | 'sell', account: '' })

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
    account: holding.account ?? '',
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
  form.value = { stockCode: '', stockName: '', shares: '', averageCost: '', costBasis: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy', account: '' }
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
    account: form.value.account?.trim() || null,
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

    <!-- 券商選擇 Modal -->
    <Teleport to="body">
      <div v-if="showBrokerModal"
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        @click.self="showBrokerModal = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <h2 class="text-base font-semibold text-slate-800 mb-1">選擇券商格式</h2>
          <p class="text-xs text-slate-400 mb-5">請選擇這份對帳單的來源券商</p>
          <div class="space-y-2">
            <button @click="parseAsFubon"
              class="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition text-left">
              <div class="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-slate-700">富邦對帳單</p>
                <p class="text-xs text-slate-400">富邦證券 XLS 對帳單格式</p>
              </div>
            </button>
          </div>
          <button @click="showBrokerModal = false" class="mt-4 w-full text-xs text-slate-400 hover:text-slate-600 transition">取消</button>
        </div>
      </div>
    </Teleport>

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

          <!-- 股票代號篩選 + 帳戶選擇 -->
          <div class="px-5 py-3 border-b border-slate-100 shrink-0 space-y-3">
            <div>
              <p class="text-xs font-medium text-slate-500 mb-2">選擇要匯入的股票（勾選 = 匯入）</p>
              <div class="flex flex-wrap gap-2">
                <label v-for="code in [...new Set(importPreview.map((r: any) => r.stockCode))]" :key="code"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer select-none transition text-xs font-medium"
                  :class="importFilterCodes.has(code) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-400'">
                  <input type="checkbox" class="hidden"
                    :checked="importFilterCodes.has(code)"
                    @change="importFilterCodes.has(code) ? importFilterCodes.delete(code) : importFilterCodes.add(code); importFilterCodes = new Set(importFilterCodes)" />
                  {{ code }}
                </label>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <p class="text-xs font-medium text-slate-500 shrink-0">歸屬帳戶</p>
              <select v-model="importAccount"
                class="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">不指定</option>
                <option v-for="acc in (accountList ?? [])" :key="acc.id" :value="acc.name">{{ acc.name }}</option>
              </select>
            </div>
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
                <tr v-for="(h, i) in importPreview.filter((r: any) => importFilterCodes.has(r.stockCode))" :key="i"
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
              {{ importing ? '匯入中…' : `確認匯入 ${importPreview.filter((r: any) => importFilterCodes.has(r.stockCode)).length} 筆持股` }}
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
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">帳戶（選填）</label>
              <select v-model="form.account"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="">不指定</option>
                <option v-for="acc in (accountList ?? [])" :key="acc.id" :value="acc.name">{{ acc.name }}</option>
              </select>
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
