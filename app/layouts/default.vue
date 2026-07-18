<script setup lang="ts">
const route = useRoute()
const { user, clearSession, authHeaders } = useAuth()
const { isGuest, promptLogin, showLoginPrompt } = useGuestGate()
const supabase = useSupabaseClient()
const { $authFetch } = useNuxtApp()
const sidebarOpen = ref(false)
watch(route, () => { sidebarOpen.value = false })

// ── XLS 匯入 ──────────────────────────────────────────────
const xlsFileInput = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importPreview = ref<any[]>([])
const importing = ref(false)
const pendingFile = ref<File | null>(null)
const importFilterCodes = ref<Set<string>>(new Set())
const importAccount = ref('')
const detecting = ref(false)
const detectError = ref('')

function detectMapping(keys: string[]) {
  const find = (...kws: string[]) => keys.find(k => kws.some(kw => k.includes(kw))) ?? null
  const dateKey    = find('日期', 'date', 'Date')
  const typeKey    = find('類別', '類型', '買賣', 'type', 'Type', '交易')
  const nameKey    = find('名稱', '股票', 'name', 'Name', '商品', '股名')
  const sharesKey  = find('股數', '數量', '張數', 'shares', 'qty', 'Qty', '成交量', '成交股數')
  const priceKey   = find('單價', '價格', '成交價', 'price', 'Price', '均價', '成交單價')
  const codeKey    = find('代號', '代碼', 'code', 'Code', '股號')
  // 國泰世華：用淨收付正負號判斷買賣
  const netKey     = find('淨收付', '淨額', '收付')

  const buyKeyword  = '買'
  const sellKeyword = '賣'
  const dateFormat  = '民國'

  return { dateKey, typeKey, nameKey, sharesKey, priceKey, codeKey, netKey, buyKeyword, sellKeyword, dateFormat, codeInName: !codeKey }
}

function triggerImport() {
  if (isGuest.value) return promptLogin()
  xlsFileInput.value?.click()
}

async function onXlsSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(e.target as HTMLInputElement).value = ''
  detectError.value = ''
  detecting.value = true
  try {
    await parseWithAI(file)
  } catch (error: any) {
    detectError.value = `無法匯入「${file.name}」：${getImportErrorMessage(error)}`
  } finally {
    detecting.value = false
  }
}

function getImportErrorMessage(error: any) {
  const message = error?.data?.message ?? error?.message ?? String(error ?? '')
  if (!message || message === '[object Object]') return '檔案格式不支援或內容無法解析'
  return message
}

function extractCode(name: string) {
  const m = name.match(/\(([^)]+)\)/)
  return m ? m[1].toUpperCase() : name.toUpperCase()
}

function toDate(s: string, format?: string) {
  // 民國轉西元
  const rocMatch = s.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (rocMatch && format?.includes('民國')) {
    const y = parseInt(rocMatch[1]) + 1911
    const m = rocMatch[2].padStart(2, '0')
    const d = rocMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return s.replace(/\//g, '-').slice(0, 10)
}

function rowsFromMatrix(matrix: any[][], headerIndex = 0) {
  const headers = (matrix[headerIndex] ?? []).map(v => String(v ?? '').trim())
  return matrix.slice(headerIndex + 1).map(values => {
    const row: any = {}
    values.forEach((value, index) => {
      if (value instanceof Date) row[headers[index] ?? index] = value.toISOString().slice(0, 10)
      else row[headers[index] ?? index] = value ?? ''
    })
    return row
  }).filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''))
}

function findImportHeaderIndex(matrix: any[][]) {
  return matrix.findIndex(row => {
    const headers = row.map(v => String(v ?? '').trim())
    const mapping = detectMapping(headers)
    return Boolean(mapping.dateKey && mapping.nameKey && mapping.sharesKey && mapping.priceKey)
  })
}

async function parseRawRows(file: File): Promise<any[]> {
  const fileName = file.name.toLowerCase()
  if (fileName.endsWith('.xlsx')) {
    const readXlsxFile = (await import('read-excel-file/browser')).default
    const workbook = await readXlsxFile(file) as any[]
    const sheets = workbook[0]?.data
      ? workbook as { sheet: string; data: any[][] }[]
      : [{ sheet: '', data: workbook as any[][] }]

    for (const sheet of sheets) {
      const headerIndex = findImportHeaderIndex(sheet.data)
      if (headerIndex >= 0) return rowsFromMatrix(sheet.data, headerIndex)
    }
    return []
  }

  const text = await file.text()
  const trimmed = text.trimStart()
  if (trimmed.startsWith('<')) {
    // HTML 偽裝 XLS
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const headers: string[] = []
    const result: any[] = []
    doc.querySelectorAll('tr').forEach((tr, i) => {
      const cells = [...tr.querySelectorAll('td,th')].map(c => c.textContent?.trim() ?? '')
      if (i === 0) { headers.push(...cells); return }
      if (cells.every(c => !c)) return
      const row: any = {}
      cells.forEach((v, j) => { row[headers[j] ?? j] = v })
      result.push(row)
    })
    return result
  } else if (file.name.endsWith('.csv') || trimmed.includes(',')) {
    // CSV 解析
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim())
    return lines.slice(1).map(line => {
      // 處理欄位內含引號與逗號的情況
      const cells: string[] = []
      let cur = '', inQuote = false
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === ',' && !inQuote) { cells.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      cells.push(cur.trim())
      const row: any = {}
      headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
      return row
    }).filter(r => Object.values(r).some(v => v !== ''))
  }

  return []
}

async function parseWithAI(file: File) {
  const rawRows = await parseRawRows(file)
  if (!rawRows.length) { detectError.value = '檔案無資料'; return }

  const keys = Object.keys(rawRows[0] ?? {})
  const mapping = detectMapping(keys)
  const { dateKey, typeKey, nameKey, sharesKey, priceKey, codeKey, netKey, buyKeyword, sellKeyword, codeInName, dateFormat } = mapping

  if (!dateKey || !nameKey || !sharesKey || !priceKey) {
    detectError.value = `無法自動識別欄位（找到：${keys.join('、')}）`
    return
  }

  const rows = rawRows.map(r => {
    const dateRaw = String(r[dateKey] ?? '')
    const nameRaw = String(r[nameKey] ?? '')
    const sharesRaw = parseFloat(String(r[sharesKey] ?? '').replace(/,/g, ''))
    const priceRaw = parseFloat(String(r[priceKey] ?? '').replace(/,/g, ''))
    if (!dateRaw || !nameRaw || isNaN(sharesRaw) || isNaN(priceRaw)) return null

    // 判斷買賣：優先用類型欄，其次用淨收付正負號
    let isSell = false
    if (typeKey && r[typeKey]) {
      isSell = String(r[typeKey]).includes(sellKeyword)
    } else if (netKey && r[netKey]) {
      const net = parseFloat(String(r[netKey]).replace(/,/g, ''))
      isSell = net > 0  // 淨收付為正 = 賣出（收到錢）
    }

    let code = ''
    let name = nameRaw
    if (codeKey && r[codeKey]) {
      code = String(r[codeKey]).trim().toUpperCase()
    } else if (codeInName && nameRaw.includes('(')) {
      code = extractCode(nameRaw)
      name = nameRaw.replace(/\([^)]*\)/, '').trim()
    } else {
      code = nameRaw.trim()
    }
    const leverageMultiplier = code.endsWith('L') ? 2 : code.endsWith('B') ? 0 : 1
    const tradeType = typeKey && r[typeKey] ? String(r[typeKey]) : isSell ? '賣出' : '買進'
    return {
      stockCode: code,
      stockName: name,
      shares: isSell ? -sharesRaw : sharesRaw,
      averageCost: priceRaw,
      buyDate: toDate(dateRaw, dateFormat),
      tradeType,
      leverageMultiplier,
    }
  }).filter(Boolean)

  if (!rows.length) { detectError.value = '無法解析此檔案格式'; return }

  // 對無法從名稱取得代號的股票，查詢 TWSE/OTC
  const needLookup = [...new Set(
    rows.filter((r: any) => r.stockCode === r.stockName).map((r: any) => r.stockName)
  )]
  const codeMap: Record<string, string> = {}
  await Promise.all(needLookup.map(async (stockName: string) => {
    try {
      const res = await ($authFetch as any)(`/api/stockholdings/search-code?name=${encodeURIComponent(stockName)}`)
      if (res?.code) codeMap[stockName] = res.code
    } catch {}
  }))
  rows.forEach((r: any) => {
    if (codeMap[r.stockName]) r.stockCode = codeMap[r.stockName]
  })

  importPreview.value = rows
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
  } catch (error: any) {
    detectError.value = `匯入失敗：${getImportErrorMessage(error)}`
  } finally {
    importing.value = false
  }
}

// ── 帳戶別名 ──────────────────────────────────────────────
const { data: accountList } = await useAppData<{ id: number; name: string }[]>('/api/accounts', {}, DEMO_ACCOUNTS)

// ──────────────────────────────────────────────────────────
const showModal = ref(false)
const editingId = ref<number | null>(null)
const lookingUp = ref(false)
const lookupError = ref('')
const isCostFocused = ref(false)

const form = ref({ stockCode: '', stockName: '', shares: '', averageCost: '', costBasis: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy' as 'buy' | 'sell', account: '' })

const refreshKey = useState('portfolioRefreshKey', () => 0)

provide('refreshKey', refreshKey)

function fillFormFromHolding(holding: any) {
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
}

provide('openEditModal', (holding: any) => {
  if (isGuest.value) return promptLogin()
  editingId.value = holding.id
  fillFormFromHolding(holding)
})

// 複製：把該筆資料帶進「新增交易」表單（editingId 保持 null → 儲存時為新增一筆）
provide('openCopyModal', (holding: any) => {
  if (isGuest.value) return promptLogin()
  editingId.value = null
  fillFormFromHolding(holding)
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function openModal() {
  if (isGuest.value) return promptLogin()
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
  form.value = { stockCode: '', stockName: '', shares: '', averageCost: '', costBasis: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '', tradeType: 'buy', account: '' }
  lookupError.value = ''
}

async function logout() {
  // 一併清掉 Supabase 的 OAuth session，否則回登入頁會用舊 session 自動登回同一帳號
  try { await supabase.auth.signOut() } catch {}
  clearSession()
  window.location.replace('/login')
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
  if (!form.value.stockCode || !form.value.averageCost) return
  if (!(Number(form.value.shares) > 0)) return
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
  <LoadingBar />
  <div class="min-h-screen bg-slate-50 flex">
    <!-- 手機遮罩 -->
    <div v-if="sidebarOpen" class="fixed inset-0 bg-black/40 z-30 md:hidden" @click="sidebarOpen = false" />

    <LayoutSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="md:ml-60 flex-1 flex flex-col min-h-screen overflow-x-hidden">
      <LayoutAppHeader @add="openModal" @import="triggerImport" @logout="logout" @menu="sidebarOpen = true" />
      <!-- 訪客範例橫幅 -->
      <div v-if="isGuest" class="px-4 md:px-6 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-center">
        <span class="text-xs text-indigo-700">📊 你正在看<strong>範例資料</strong>，登入後即可管理自己的投資組合</span>
        <NuxtLink to="/login" class="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-lg transition">登入 / 註冊</NuxtLink>
      </div>
      <main class="flex-1 p-4 md:p-6">
        <slot />
      </main>
      <footer class="px-4 md:px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-2">
        <p class="text-xs text-slate-400">有問題或建議？</p>
        <a href="https://ulvis.net/stocksline" target="_blank" rel="noopener"
          class="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 transition">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
          加入 LINE 社群
        </a>
      </footer>
    </div>

    <!-- 隱藏的 XLS 檔案輸入 -->
    <input ref="xlsFileInput" type="file" accept=".xls,.xlsx,.csv" class="hidden" @change="onXlsSelected" />

    <!-- 訪客登入提示視窗 -->
    <Teleport to="body">
      <div v-if="showLoginPrompt"
        class="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4"
        @click.self="showLoginPrompt = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-slate-800 mb-1">登入後即可使用</h2>
          <p class="text-sm text-slate-500 mb-5 leading-6">目前為範例預覽模式。登入或註冊後，就能新增交易、匯入對帳單、管理你自己的投資組合。</p>
          <div class="flex gap-2">
            <button @click="showLoginPrompt = false"
              class="flex-1 px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition">
              先看看
            </button>
            <NuxtLink to="/login" @click="showLoginPrompt = false"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition">
              登入 / 註冊
            </NuxtLink>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI 偵測中 / 錯誤提示 -->
    <Teleport to="body">
      <div v-if="detecting || detectError"
        class="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
        @click.self="detectError = ''">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <template v-if="detecting">
            <svg class="animate-spin w-8 h-8 text-indigo-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p class="text-sm font-medium text-slate-700">AI 正在分析欄位格式…</p>
            <p class="text-xs text-slate-400 mt-1">通常不到 5 秒</p>
          </template>
          <template v-else-if="detectError">
            <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <h2 class="text-base font-semibold text-slate-800 mb-1">匯入失敗</h2>
            <p class="text-sm text-slate-500 mb-4 leading-6">{{ detectError }}</p>
            <button @click="detectError = ''" class="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition">我知道了</button>
          </template>
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
              <p class="text-xs text-slate-400 mt-0.5">
                已從交易記錄計算出以下持股，確認後將新增到你的帳戶．
                <a href="/股票交易匯入範本.xlsx" download class="text-indigo-500 hover:text-indigo-700 underline">下載範本</a>
              </p>
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
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-medium text-slate-500">選擇要匯入的股票（勾選 = 匯入）</p>
                <div class="flex gap-2">
                  <button @click="importFilterCodes = new Set(importPreview.map((r: any) => r.stockCode))"
                    class="text-xs text-indigo-500 hover:text-indigo-700 transition">全選</button>
                  <span class="text-slate-300">|</span>
                  <button @click="importFilterCodes = new Set()"
                    class="text-xs text-slate-400 hover:text-slate-600 transition">全部取消</button>
                </div>
              </div>
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
                <input v-model="form.shares" type="number" min="0" step="1000" placeholder="例：1000（1張）"
                  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1.5">
                  {{ form.tradeType === 'sell' ? '賣出價格（每股）' : '平均成本（每股）' }}
                  <span v-if="form.tradeType === 'sell' && form.costBasis" class="ml-1 font-normal text-slate-400">均成本 {{ Number(form.costBasis).toLocaleString('zh-TW') }}</span>
                  <span v-else-if="form.averageCost && !editingId" class="ml-1 font-normal text-indigo-400">← 已帶入現價</span>
                </label>
                <input
                  :value="isCostFocused ? form.averageCost : (form.averageCost !== '' ? Number(form.averageCost).toLocaleString('zh-TW') : '')"
                  type="text" inputmode="decimal" placeholder="輸入代號後自動帶入"
                  @focus="(e: any) => { isCostFocused = true; e.target.value = String(form.averageCost).replace(/,/g, '') }"
                  @blur="(e: any) => { isCostFocused = false; const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) form.averageCost = String(n) }"
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
              <p class="text-xs text-slate-400 mt-1.5">選擇帳戶會讓總成本在賣出的時候分別帳戶計算</p>
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
