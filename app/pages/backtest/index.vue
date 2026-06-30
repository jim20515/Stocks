<script setup lang="ts">
const { authHeaders } = useAuth()

type PriceRow = {
  date: string
  close_price: number
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

const code = ref('')
const startDate = ref('2004-01-01')
const endDate = ref(today)
const initialCapital = ref(1000000)
const priceMode = ref<'raw' | 'adjusted'>('raw')
const dividendMode = ref<'cash' | 'reinvest'>('cash')
const costMode = ref<'default' | 'custom' | 'none'>('default')
const feeRate = ref(0.1425)
const minFee = ref(20)
const stockTaxRate = ref(0.3)
const etfTaxRate = ref(0.1)

type DividendRow = {
  ex_date: string
  dividend_per_share: number
}

const { updating: updatingAllLatest, progress: updateAllProgress } = useBacktestUpdate()

// ── 股票搜尋下拉 ─────────────────────────────────────────────
const { data: allCodesData } = await useFetch<any>('/api/backtest/all-codes', {
  headers: authHeaders.value as HeadersInit,
})
const allStocks = computed(() => {
  const raw = [...(allCodesData.value?.stocks ?? [])]
  raw.sort((a: any, b: any) => {
    const ap = pinnedCodes.value.includes(a.code) ? 0 : 1
    const bp = pinnedCodes.value.includes(b.code) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.code.localeCompare(b.code)
  })
  return raw
})
const pinnedCodes = ref<string[]>(
  JSON.parse(typeof localStorage !== 'undefined' ? (localStorage.getItem('pinned_stocks') ?? '[]') : '[]')
)
function togglePin(stockCode: string, e: Event) {
  e.stopPropagation()
  const idx = pinnedCodes.value.indexOf(stockCode)
  if (idx >= 0) pinnedCodes.value.splice(idx, 1)
  else pinnedCodes.value.push(stockCode)
  localStorage.setItem('pinned_stocks', JSON.stringify(pinnedCodes.value))
}
const codeSearch = ref('')
const showCodeDropdown = ref(false)
const filteredStocks = computed(() => {
  const q = codeSearch.value.trim().toUpperCase()
  if (!q) return allStocks.value
  return allStocks.value.filter((s: any) => s.code.includes(q) || s.name?.toUpperCase().includes(q))
})
function selectCode(c: string) {
  code.value = c
  const s = allStocks.value.find((s: any) => s.code === c)
  codeSearch.value = s ? `${s.code}　${s.name}` : c
  showCodeDropdown.value = false
}
function onCodeFocus() { codeSearch.value = ''; showCodeDropdown.value = true }
function onCodeBlur() { setTimeout(() => { showCodeDropdown.value = false }, 150) }

const loading = ref(false)
const updatingDividends = ref(false)
const lookingUpFirstDate = ref(false)
const firstDateHint = ref('')
const lastLookupCode = ref('')
const progressText = ref('')
const error = ref('')
const showResult = ref(false)
const prices = ref<PriceRow[]>([])
const dividends = ref<DividendRow[]>([])
let lookupTimer: ReturnType<typeof setTimeout> | null = null

const firstPrice = computed(() => prices.value[0] ?? null)
const lastPrice = computed(() => prices.value[prices.value.length - 1] ?? null)
const inferredSecurityType = computed<'stock' | 'etf'>(() => {
  const normalizedCode = code.value.trim().toUpperCase()
  if (/^0\d{4,5}[A-Z]?$/.test(normalizedCode)) return 'etf'
  return 'stock'
})
const inferredSecurityLabel = computed(() => inferredSecurityType.value === 'etf' ? 'ETF / 債券 ETF' : '股票')
const taxRate = computed(() => inferredSecurityType.value === 'stock' ? stockTaxRate.value : etfTaxRate.value)
const initialCapitalText = computed({
  get: () => initialCapital.value.toLocaleString('zh-TW'),
  set: (value: string) => {
    const numeric = Number(String(value).replace(/,/g, ''))
    initialCapital.value = Number.isFinite(numeric) ? numeric : 0
  },
})

function money(v: number) {
  return Math.round(v).toLocaleString('zh-TW')
}

function pct(v: number | null) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

function calcFee(amount: number) {
  if (costMode.value === 'none') return 0
  const fee = amount * (feeRate.value / 100)
  return Math.max(minFee.value, fee)
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
    firstDateHint.value = `已自動帶入第一個交易日：${firstDate}`
  } catch (e: any) {
    firstDateHint.value = e?.data?.message ?? '查不到第一個交易日，請手動選擇開始日期'
  } finally {
    lookingUpFirstDate.value = false
  }
}

watch(code, (value) => {
  firstDateHint.value = ''
  if (lookupTimer) clearTimeout(lookupTimer)
  const normalizedCode = value.trim().toUpperCase()
  if (normalizedCode.length < 4) return
  lookupTimer = setTimeout(() => lookupFirstDate(), 600)
})

const result = computed(() => {
  if (!firstPrice.value || !lastPrice.value || initialCapital.value <= 0) return null

  const buyPrice = Number(firstPrice.value.close_price)
  const sellPrice = Number(lastPrice.value.close_price)
  if (buyPrice <= 0 || sellPrice <= 0) return null

  // 用估算方式保守扣除買進手續費，讓可買股數不超過本金。
  const estimatedBuyFee = costMode.value === 'none'
    ? 0
    : Math.max(minFee.value, initialCapital.value * (feeRate.value / 100))
  const initialShares = Math.floor((initialCapital.value - estimatedBuyFee) / buyPrice)
  const buyAmount = initialShares * buyPrice
  const buyFee = calcFee(buyAmount)
  const invested = buyAmount + buyFee

  // 配息計算：篩出持有期間內有效除息日
  const priceMap = new Map(prices.value.map(p => [p.date, Number(p.close_price)]))
  const divInPeriod = dividends.value.filter(d =>
    d.ex_date >= firstPrice.value!.date && d.ex_date <= lastPrice.value!.date,
  )

  let totalDividendCash = 0
  let finalShares = initialShares
  let leftoverCash = 0
  const dividendEvents: { ex_date: string; amount: number; sharesAdded?: number }[] = []

  if (dividendMode.value === 'cash') {
    for (const d of divInPeriod) {
      const cash = initialShares * d.dividend_per_share
      totalDividendCash += cash
      dividendEvents.push({ ex_date: d.ex_date, amount: cash })
    }
  } else {
    // 再投入：用除息日收盤價買回（不強制整張，以股為單位）
    let currentShares = initialShares
    for (const d of divInPeriod) {
      const exPrice = priceMap.get(d.ex_date) ?? sellPrice
      const cash = currentShares * d.dividend_per_share + leftoverCash
      const additionalShares = Math.floor(cash / exPrice)
      leftoverCash = cash - additionalShares * exPrice
      currentShares += additionalShares
      dividendEvents.push({ ex_date: d.ex_date, amount: cash, sharesAdded: additionalShares })
    }
    finalShares = currentShares
    totalDividendCash = leftoverCash
  }

  const sellAmount = finalShares * sellPrice
  const sellFee = calcFee(sellAmount)
  const sellTax = costMode.value === 'none' ? 0 : sellAmount * (taxRate.value / 100)
  const finalValue = sellAmount - sellFee - sellTax + (dividendMode.value === 'cash' ? totalDividendCash : leftoverCash)
  const profit = finalValue - invested
  const returnPct = invested > 0 ? profit / invested * 100 : null

  return {
    shares: initialShares,
    finalShares,
    buyPrice,
    sellPrice,
    buyAmount,
    buyFee,
    invested,
    sellAmount,
    sellFee,
    sellTax,
    totalDividendCash,
    dividendEvents,
    finalValue,
    profit,
    returnPct,
  }
})

async function runBacktest() {
  if (!code.value.trim()) {
    error.value = '請輸入股票代號'
    return
  }

  loading.value = true
  error.value = ''
  showResult.value = true
  prices.value = []
  dividends.value = []
  progressText.value = '從資料庫讀取回測資料...'

  try {
    const normalizedCode = code.value.trim().toUpperCase()
    const [priceRes, divRes] = await Promise.all([
      $fetch<any>('/api/backtest/prices', {
        headers: authHeaders.value as HeadersInit,
        query: { code: normalizedCode, startDate: startDate.value, endDate: endDate.value },
      }),
      $fetch<any>('/api/backtest/dividends', {
        headers: authHeaders.value as HeadersInit,
        query: { code: normalizedCode, startDate: startDate.value, endDate: endDate.value },
      }),
    ])

    prices.value = priceRes.prices ?? []
    dividends.value = divRes.dividends ?? []

    if (!prices.value.length) {
      error.value = '資料庫尚無此區間價格，請先到「更新歷史數據」更新價格'
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? '回測資料讀取失敗'
  } finally {
    loading.value = false
    progressText.value = ''
  }
}

async function updateDividends() {
  if (updatingDividends.value) return
  updatingDividends.value = true
  try {
    const normalizedCode = code.value.trim().toUpperCase()
    await $fetch('/api/backtest/dividends-update', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: { code: normalizedCode },
    })
    const divRes = await $fetch<any>('/api/backtest/dividends', {
      headers: authHeaders.value as HeadersInit,
      query: { code: normalizedCode, startDate: startDate.value, endDate: endDate.value },
    })
    dividends.value = divRes.dividends ?? []
  } catch (e: any) {
    error.value = e?.data?.message ?? '配息資料更新失敗'
  } finally {
    updatingDividends.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white border border-slate-200 rounded-xl p-5">
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(180px,250px)_minmax(180px,250px)_minmax(180px,250px)_minmax(180px,250px)_auto] gap-3 lg:items-end">
          <div class="relative">
            <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
            <input
              v-model="codeSearch"
              type="text" placeholder="搜尋代號或名稱…"
              @focus="onCodeFocus"
              @blur="onCodeBlur"
              @keyup.enter="lookupFirstDate"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div v-if="showCodeDropdown"
              class="absolute z-30 mt-1 w-full min-w-56 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <div v-if="filteredStocks.length === 0" class="px-3 py-2 text-xs text-slate-400">無符合結果</div>
              <div
                v-for="s in filteredStocks" :key="s.code"
                class="flex items-center group"
                :class="s.code === code ? 'bg-indigo-50' : 'hover:bg-slate-50'"
              >
                <button type="button"
                  class="pl-2.5 pr-1 py-2 shrink-0 transition"
                  :class="pinnedCodes.includes(s.code) ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300'"
                  @mousedown.prevent="togglePin(s.code, $event)"
                  title="釘選至最上方">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
                <button type="button"
                  class="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                  :class="s.code === code ? 'text-indigo-600' : 'text-slate-700'"
                  @mousedown.prevent="selectCode(s.code); lookupFirstDate()">
                  <span>
                    <span class="font-mono font-medium">{{ s.code }}</span>
                    <span v-if="s.name && s.name !== '—'" class="ml-2 text-slate-500">{{ s.name }}</span>
                  </span>
                  <span v-if="!s.count" class="text-xs text-orange-400 ml-2 shrink-0">無資料</span>
                  <span v-else class="text-xs text-slate-300 ml-2 shrink-0">{{ s.count?.toLocaleString() }}天</span>
                </button>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1.5">開始日期</label>
            <input v-model="startDate" type="date"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1.5">結束日期</label>
            <input v-model="endDate" type="date"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1.5">投入本金</label>
            <input v-model="initialCapitalText" type="text" inputmode="numeric"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <button @click="runBacktest" :disabled="loading"
            class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition sm:col-span-2 lg:col-span-1 lg:min-w-32">
            <svg :class="loading ? 'animate-spin' : ''" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 5l7 7-7 7V5z" />
            </svg>
            {{ loading ? '回測中...' : '開始回測' }}
          </button>
        </div>
      </div>
      <div v-if="code.trim().length >= 4 || firstDateHint" class="mt-2 text-xs leading-5 text-slate-400">
        <span v-if="code.trim().length >= 4">系統判斷：{{ inferredSecurityLabel }}，賣出交易稅率 {{ taxRate }}%</span>
        <span v-if="firstDateHint" class="block" :class="lookingUpFirstDate ? 'text-indigo-500' : firstDateHint.includes('已自動') ? 'text-green-600' : 'text-slate-400'">{{ firstDateHint }}</span>
        <span v-if="allStocks.find((s: any) => s.code === code)?.count === 0" class="block mt-0.5 text-orange-500">
          此股票尚無歷史數據，請先前往
          <NuxtLink to="/backtest/history" class="underline text-indigo-500">更新歷史數據</NuxtLink>
          頁面抓取後再回來。
        </span>
      </div>
      <p v-if="updateAllProgress" class="text-xs text-indigo-500 mt-2">{{ updateAllProgress }}</p>
      <p v-if="progressText" class="text-xs text-indigo-500 mt-2">{{ progressText }}</p>
      <p v-if="error" class="text-xs text-red-500 mt-2">{{ error }}</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section class="bg-white border border-slate-200 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">價格模式</h3>
        <div class="space-y-2">
          <label class="flex gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 cursor-pointer">
            <input v-model="priceMode" type="radio" value="raw" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">原始收盤價</span>
              <span class="block text-xs text-slate-500 mt-0.5">使用 TWSE/TPEx 每日收盤價，適合檢查價格走勢與簡單買進持有回測。</span>
            </span>
          </label>
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3 opacity-60">
            <input v-model="priceMode" type="radio" value="adjusted" disabled class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">還原股價</span>
              <span class="block text-xs text-slate-500 mt-0.5">會納入除權息、分割與配息調整；目前需要補齊公司行動資料表後啟用。</span>
            </span>
          </label>
        </div>
      </section>

      <section class="bg-white border border-slate-200 rounded-xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-800">配息處理</h3>
          <button v-if="showResult && code.trim().length >= 4"
            @click="updateDividends" :disabled="updatingDividends"
            class="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50">
            {{ updatingDividends ? '更新中...' : '更新配息資料' }}
          </button>
        </div>
        <div class="space-y-2">
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
            <input v-model="dividendMode" type="radio" value="cash" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">領現金</span>
              <span class="block text-xs text-slate-500 mt-0.5">配息進入現金部位，期末一次計入損益。</span>
            </span>
          </label>
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
            <input v-model="dividendMode" type="radio" value="reinvest" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">再投入</span>
              <span class="block text-xs text-slate-500 mt-0.5">每次配息後以除息日收盤價買回同一檔，適合長期總報酬回測。</span>
            </span>
          </label>
        </div>
        <p v-if="showResult && dividends.length" class="text-xs mt-2 text-green-600">
          已載入 {{ dividends.length }} 筆配息記錄
        </p>
        <p v-else-if="showResult && dividendMode === 'reinvest'" class="text-xs mt-2 text-amber-500">
          未找到配息資料，點上方「更新配息資料」從 Yahoo Finance 取得
        </p>
      </section>

      <section class="bg-white border border-slate-200 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">交易成本</h3>
        <div class="space-y-2">
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3">
            <input v-model="costMode" type="radio" value="default" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">使用台股預設</span>
              <span class="block text-xs text-slate-500 mt-0.5">手續費 0.1425%，最低 20 元；賣出交易稅依股票/ETF 類型計算。</span>
            </span>
          </label>
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3">
            <input v-model="costMode" type="radio" value="custom" class="mt-1" />
            <span class="flex-1">
              <span class="block text-sm font-medium text-slate-800">自訂成本</span>
              <span class="block text-xs text-slate-500 mt-0.5">可依你的券商折扣或策略假設調整。</span>
            </span>
          </label>
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3">
            <input v-model="costMode" type="radio" value="none" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">不計成本</span>
              <span class="block text-xs text-slate-500 mt-0.5">只觀察價格報酬，不扣手續費與交易稅。</span>
            </span>
          </label>
        </div>

        <div v-if="costMode === 'custom'" class="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">手續費率 %</label>
            <input v-model.number="feeRate" type="number" step="0.0001"
              class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">最低手續費</label>
            <input v-model.number="minFee" type="number"
              class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">股票稅率 %</label>
            <input v-model.number="stockTaxRate" type="number" step="0.01"
              class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">ETF 稅率 %</label>
            <input v-model.number="etfTaxRate" type="number" step="0.01"
              class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg" />
          </div>
        </div>
      </section>
    </div>

    <div v-if="showResult && result" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <p class="text-xs text-slate-400 mb-1">資料期間</p>
        <p class="text-lg font-bold text-slate-800">{{ firstPrice?.date }} ~ {{ lastPrice?.date }}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <p class="text-xs text-slate-400 mb-1">可買股數</p>
        <p class="text-lg font-bold text-slate-800">{{ money(result.shares) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <p class="text-xs text-slate-400 mb-1">期末價值</p>
        <p class="text-lg font-bold text-slate-800">{{ money(result.finalValue) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5"
        :class="result.profit >= 0 ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-green-500'">
        <p class="text-xs text-slate-400 mb-1">總損益</p>
        <p class="text-lg font-bold" :class="result.profit >= 0 ? 'text-red-500' : 'text-green-600'">
          {{ result.profit > 0 ? '+' : '' }}{{ money(result.profit) }}（{{ pct(result.returnPct) }}）
        </p>
      </div>
    </div>

    <div v-if="showResult && result" class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">回測明細</h3>
        <p class="text-xs text-slate-400 mt-0.5">買進持有模型，買在第一筆價格、賣在最後一筆價格。</p>
      </div>
      <table class="w-full text-sm">
        <tbody class="divide-y divide-slate-50">
          <tr>
            <td class="px-5 py-3 text-slate-500">買進價格 / 賣出價格</td>
            <td class="px-5 py-3 text-right font-medium text-slate-800">{{ result.buyPrice }} / {{ result.sellPrice }}</td>
          </tr>
          <tr>
            <td class="px-5 py-3 text-slate-500">買進金額 + 手續費</td>
            <td class="px-5 py-3 text-right font-medium text-slate-800">{{ money(result.buyAmount) }} + {{ money(result.buyFee) }}</td>
          </tr>
          <tr v-if="dividendMode === 'reinvest' && result.finalShares !== result.shares">
            <td class="px-5 py-3 text-slate-500">持有股數（含配息再投入）</td>
            <td class="px-5 py-3 text-right font-medium text-slate-800">{{ result.shares }} → {{ result.finalShares }} 股</td>
          </tr>
          <tr>
            <td class="px-5 py-3 text-slate-500">賣出金額 - 手續費 - 交易稅</td>
            <td class="px-5 py-3 text-right font-medium text-slate-800">
              {{ money(result.sellAmount) }} - {{ money(result.sellFee) }} - {{ money(result.sellTax) }}
            </td>
          </tr>
          <tr v-if="result.dividendEvents.length > 0">
            <td class="px-5 py-3 text-slate-500">
              {{ dividendMode === 'cash' ? '配息收入（現金）' : '配息再投入金額' }}
            </td>
            <td class="px-5 py-3 text-right font-medium text-green-600">
              + {{ money(result.totalDividendCash) }}
              <span class="text-xs text-slate-400 ml-1">（{{ result.dividendEvents.length }} 次）</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="result.dividendEvents.length > 0" class="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
        <p class="text-xs font-medium text-slate-500 mb-2">配息紀錄</p>
        <div class="space-y-1">
          <div v-for="ev in result.dividendEvents" :key="ev.ex_date" class="flex justify-between text-xs text-slate-500">
            <span>{{ ev.ex_date }}</span>
            <span class="text-green-600">
              +{{ money(ev.amount) }}
              <span v-if="ev.sharesAdded != null"> → 買入 {{ ev.sharesAdded }} 股</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
