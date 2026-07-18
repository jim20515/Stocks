<script setup lang="ts">
const { authHeaders } = useAuth()

type PriceRow = {
  date: string
  close_price: number
}

type StockStat = {
  code: string
  name: string
  minDate: string
  maxDate: string
  count: number
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

const code = ref('')
const startDate = ref('2004-01-01')
const endDate = ref(today)
const updatingPrices = ref(false)
const tooltip = ref<{ text: string; x: number; y: number } | null>(null)
function showTip(e: MouseEvent, text: string) { tooltip.value = { text, x: e.clientX, y: e.clientY + 20 } }
function hideTip() { tooltip.value = null }
const lookingUpFirstDate = ref(false)
const firstDateHint = ref('')
const lastLookupCode = ref('')
const progressText = ref('')
const error = ref('')
const logs = ref<string[]>([])
const prices = ref<PriceRow[]>([])
const stocks = ref<StockStat[]>([])
const deletingCode = ref<string | null>(null)
const sortKey = ref<keyof StockStat>('code')
const sortDir = ref<'asc' | 'desc'>('asc')
const PAGE_SIZE = 10
const currentPage = ref(1)

function toggleSort(key: keyof StockStat) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
  currentPage.value = 1
}

const sortedStocks = computed(() => {
  return [...stocks.value].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'zh-TW', { numeric: true })
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

function goPage(p: number) { currentPage.value = p }
const totalPages = computed(() => Math.max(1, Math.ceil(sortedStocks.value.length / PAGE_SIZE)))
const pagedStocks = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedStocks.value.slice(start, start + PAGE_SIZE)
})
const inferredSecurityType = computed<'stock' | 'etf'>(() => {
  const normalizedCode = code.value.trim().toUpperCase()
  if (/^0\d{4,5}[A-Z]?$/.test(normalizedCode)) return 'etf'
  return 'stock'
})
const inferredSecurityLabel = computed(() => inferredSecurityType.value === 'etf' ? 'ETF / 債券 ETF' : '股票')

async function loadStocks() {
  try {
    const res = await $fetch<{ stocks: StockStat[] }>('/api/backtest/all-codes', {
      headers: authHeaders.value as HeadersInit,
    })
    stocks.value = res.stocks ?? []
  } catch {}
}

async function fetchFirstTradingDate(normalizedCode: string) {
  const res = await $fetch<{ firstDate: string; sourceNote?: string }>('/api/backtest/first-date', {
    query: { code: normalizedCode },
    headers: authHeaders.value as HeadersInit,
  })
  return res.firstDate
}

async function lookupFirstDate() {
  const normalizedCode = code.value.trim().toUpperCase()
  if (normalizedCode.length < 4 || normalizedCode === lastLookupCode.value) return

  lookingUpFirstDate.value = true
  firstDateHint.value = '正在查詢第一個交易日...'
  lastLookupCode.value = normalizedCode

  try {
    const firstDate = await fetchFirstTradingDate(normalizedCode)
    startDate.value = firstDate
    firstDateHint.value = `已自動判斷第一個交易日：${firstDate}`
  } catch (e: any) {
    firstDateHint.value = e?.data?.message ?? '查不到第一個交易日'
  } finally {
    lookingUpFirstDate.value = false
  }
}

watch(code, () => {
  firstDateHint.value = ''
  error.value = ''
})

async function loadCurrentRangePrices() {
  const res = await $fetch<any>('/api/backtest/prices', {
    headers: authHeaders.value as HeadersInit,
    query: {
      code: code.value.trim().toUpperCase(),
      startDate: startDate.value,
      endDate: endDate.value,
    },
  })
  prices.value = res.prices ?? []
  return prices.value
}

function nextDate(date: string) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}

async function updatePriceData() {
  if (!code.value.trim()) {
    error.value = '請輸入股票代號'
    return
  }

  updatingPrices.value = true
  error.value = ''
  logs.value = []
  progressText.value = '正在檢查資料庫現有資料...'

  try {
    const normalizedCode = code.value.trim().toUpperCase()

    // 先查 DB 最新日期
    const latest = await $fetch<{ latestDate: string | null }>('/api/backtest/latest-date', {
      headers: authHeaders.value as HeadersInit,
      query: { code: normalizedCode },
    })

    let cursor: string | null
    if (latest.latestDate && latest.latestDate >= today) {
      logs.value.push(`DB 已是最新資料（${latest.latestDate}），僅加入追蹤清單`)
      // 仍需呼叫 history API 一次以觸發 tracking upsert
      await $fetch<any>('/api/backtest/history', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: { code: normalizedCode, startDate: today, endDate: today, maxMonths: 1 },
      })
      await loadStocks()
      return
    } else if (latest.latestDate) {
      // 有資料但不是最新，從最新日期的隔天繼續
      cursor = nextDate(latest.latestDate)
      logs.value.push(`DB 現有資料至 ${latest.latestDate}，從 ${cursor} 繼續更新`)
    } else {
      // 完全沒資料，從第一個交易日開始
      cursor = startDate.value
      try {
        cursor = await fetchFirstTradingDate(normalizedCode)
        startDate.value = cursor
        firstDateHint.value = `已自動判斷第一個交易日：${cursor}`
        logs.value.push(`系統判斷開始日期：${cursor}`)
      } catch {
        logs.value.push(`查不到第一個交易日，改用目前開始日期：${startDate.value}`)
      }
    }

    progressText.value = '正在更新歷史價格資料...'
    let guard = 0
    while (cursor && guard < 100) {
      const res = await $fetch<any>('/api/backtest/history', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: {
          code: normalizedCode,
          startDate: cursor,
          endDate: today,
          maxMonths: 24,
        },
      })

      logs.value.push(...(res.logs ?? []))
      prices.value = res.prices ?? []
      progressText.value = `已更新 ${res.monthsProcessed ?? 0} 個月份，資料 ${prices.value.length} 筆`
      cursor = res.nextStartDate
      guard++
    }

    if (cursor) {
      logs.value.push('資料區間較長，已先載入部分月份；可再次執行補齊後續資料')
    }

    // 同步更新配息資料
    try {
      progressText.value = '正在更新配息資料...'
      await $fetch('/api/backtest/dividends-update', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: { code: normalizedCode },
      })
      logs.value.push('配息資料已同步更新')
    } catch {
      logs.value.push('配息資料更新失敗（不影響價格資料）')
    }

    await loadStocks()

    // 更新後確認資料是否存在（今天可能尚無收盤價，但歷史資料仍有效）
    const stat = stocks.value.find(s => s.code === normalizedCode)
    if (!stat || stat.count === 0) {
      error.value = '查無歷史價格，請確認股票代號'
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? '價格資料更新失敗'
  } finally {
    updatingPrices.value = false
    progressText.value = ''
  }
}

async function deleteStock(targetCode: string) {
  if (deletingCode.value) return
  deletingCode.value = targetCode
  try {
    await $fetch('/api/backtest/stock', {
      method: 'DELETE',
      headers: authHeaders.value as HeadersInit,
      query: { code: targetCode },
    })
    stocks.value = stocks.value.filter(s => s.code !== targetCode)
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
    if (prices.value.length && code.value.trim().toUpperCase() === targetCode) {
      prices.value = []
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? '刪除失敗'
  } finally {
    deletingCode.value = null
  }
}

onMounted(() => loadStocks())
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white border border-slate-200 rounded-xl p-5">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,300px)_auto] gap-3 lg:items-end pb-8">
        <div class="relative">
          <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
          <input v-model="code" type="text" placeholder="例如 2330、0050、009816"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase" />
          <p v-if="code.trim().length >= 4"
            class="absolute left-0 top-full z-10 mt-1 w-full text-xs text-slate-400 leading-4">
            系統判斷：{{ inferredSecurityLabel }}
          </p>
        </div>
        <button @click="updatePriceData" :disabled="updatingPrices"
          @mouseenter="showTip($event, '當選擇一檔股票更新歷史數據後，接下來只要在回測分析的更新最新價格按鈕更新，就可以得到最新價格')"
          @mouseleave="hideTip"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-60 transition">
          <svg :class="updatingPrices ? 'animate-spin' : ''" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ updatingPrices ? '更新中...' : '更新股票歷史數據' }}
        </button>
      </div>
      <p v-if="progressText" class="text-xs text-indigo-500 mt-3">{{ progressText }}</p>
      <p v-if="error" class="text-xs text-red-500 mt-3">{{ error }}</p>
    </div>

    <!-- 已建立的股票列表 -->
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">已建立歷史資料的股票</h3>
        <p class="text-xs text-slate-400 mt-0.5">資料為所有使用者共用。刪除後回測分析將無法使用該股票。</p>
      </div>
      <div v-if="stocks.length === 0" class="px-5 py-8 text-center text-sm text-slate-400">
        尚無資料，請輸入股票代號後點「更新股票歷史數據」
      </div>
      <template v-else>
      <div class="hidden sm:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('code')">
                代號 / 名稱
                <span class="ml-1 opacity-50">{{ sortKey === 'code' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('minDate')">
                資料起始
                <span class="ml-1 opacity-50">{{ sortKey === 'minDate' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('maxDate')">
                資料截止
                <span class="ml-1 opacity-50">{{ sortKey === 'maxDate' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="text-right px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600" @click="toggleSort('count')">
                筆數
                <span class="ml-1 opacity-50">{{ sortKey === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="s in pagedStocks" :key="s.code" class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                    <span class="text-xs font-bold text-indigo-600">{{ s.code.slice(0, 2) }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-slate-800">{{ s.code }}</p>
                    <p class="text-xs text-slate-400">{{ s.name }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">{{ s.minDate }}</td>
              <td class="px-4 py-3.5 text-slate-500 text-xs">{{ s.maxDate }}</td>
              <td class="px-4 py-3.5 text-right text-slate-600">{{ s.count.toLocaleString() }}</td>
              <td class="px-4 py-3.5">
                <div class="flex justify-end">
                  <button @click="deleteStock(s.code)" :disabled="deletingCode === s.code"
                    class="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 transition">
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
      <!-- 手機卡片 -->
      <div class="sm:hidden divide-y divide-slate-100">
        <div v-for="s in pagedStocks" :key="s.code" class="p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0"><span class="text-xs font-bold text-indigo-600">{{ s.code.slice(0, 2) }}</span></div>
              <div class="min-w-0"><p class="font-semibold text-slate-800">{{ s.code }}</p><p class="text-xs text-slate-400 truncate">{{ s.name }}</p></div>
            </div>
            <button @click="deleteStock(s.code)" :disabled="deletingCode === s.code" class="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2.5">
            <div class="flex flex-col"><span class="text-slate-400">起始</span><span class="text-slate-500">{{ s.minDate }}</span></div>
            <div class="flex flex-col"><span class="text-slate-400">截止</span><span class="text-slate-500">{{ s.maxDate }}</span></div>
            <div class="flex flex-col"><span class="text-slate-400">筆數</span><span class="text-slate-600">{{ s.count.toLocaleString() }}</span></div>
          </div>
        </div>
      </div>
      </template>
      <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
        <p class="text-xs text-slate-400">共 {{ stocks.length }} 筆，第 {{ currentPage }} / {{ totalPages }} 頁</p>
        <div class="flex items-center gap-1">
          <button @click="goPage(1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">«</button>
          <button @click="goPage(currentPage - 1)" :disabled="currentPage === 1"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">‹</button>
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
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">›</button>
          <button @click="goPage(totalPages)" :disabled="currentPage === totalPages"
            class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition">»</button>
        </div>
      </div>
    </div>

    <div v-if="logs.length" class="bg-white border border-slate-200 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-800 mb-3">資料抓取記錄（{{ logs.length }} 筆）</h3>
      <div class="max-h-72 overflow-y-auto space-y-1 text-xs text-slate-500">
        <p v-for="(log, idx) in logs" :key="idx">{{ log }}</p>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="tooltip"
        class="fixed z-[9999] pointer-events-none px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs rounded-lg shadow-lg max-w-xs -translate-x-1/2"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        {{ tooltip.text }}
      </div>
    </Teleport>
  </div>
</template>
