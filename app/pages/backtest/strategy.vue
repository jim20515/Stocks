<script setup lang="ts">
const { authHeaders } = useAuth()
const { updating: updatingAllLatest, progress: updateAllProgress, updateAllLatestPrices } = useBacktestUpdate()

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

// ── 股票選擇 ───────────────────────────────────────────────
const { data: allCodesData } = await useFetch<any>('/api/backtest/all-codes', {
  headers: authHeaders.value as HeadersInit,
})
// 收藏股票（存 localStorage）
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

const stocks = computed<{ code: string; name: string; minDate: string; maxDate: string; count: number }[]>(() => {
  const raw = [...(allCodesData.value?.stocks ?? [])]
  raw.sort((a: any, b: any) => {
    const ap = pinnedCodes.value.includes(a.code) ? 0 : 1
    const bp = pinnedCodes.value.includes(b.code) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.code.localeCompare(b.code)
  })
  return raw
})
const hasData = (s: { count: number }) => s.count > 0

const selectedCode = ref('')
const selectedStock = computed(() => stocks.value.find(s => s.code === selectedCode.value) ?? null)

// 搜尋下拉
const codeSearch = ref('')
const showDropdown = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const filteredStocks = computed(() => {
  const q = codeSearch.value.trim().toUpperCase()
  if (!q) return stocks.value
  return stocks.value.filter(s =>
    s.code.includes(q) || s.name.toUpperCase().includes(q)
  )
})

function selectStock(code: string) {
  selectedCode.value = code
  const s = stocks.value.find(s => s.code === code)
  codeSearch.value = s ? `${s.code}　${s.name}` : code
  showDropdown.value = false
  result.value = null
}

function onSearchFocus() {
  codeSearch.value = ''
  showDropdown.value = true
}

function onSearchBlur() {
  // 延遲關閉讓 click 先觸發
  setTimeout(() => { showDropdown.value = false }, 150)
}

watch(selectedCode, () => {
  const minDate = selectedStock.value?.minDate
  startDateObj.value = minDate && minDate !== '—' ? new Date(minDate) : new Date(today)
  endDateObj.value = new Date(today)
})

// ── 日期 ──────────────────────────────────────────────────
const fmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

const startDateObj = ref(new Date(today))
const endDateObj = ref(new Date(today))
const startDate = computed(() => fmt(startDateObj.value))
const endDate = computed(() => fmt(endDateObj.value))

function setDateRange(preset: 'thisMonth' | 'lastMonth' | 'threeMonths' | 'ytd' | 'oneYear' | 'threeYears') {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (preset === 'thisMonth') { startDateObj.value = new Date(y, m, 1); endDateObj.value = now }
  else if (preset === 'lastMonth') { startDateObj.value = new Date(y, m - 1, 1); endDateObj.value = new Date(y, m, 0) }
  else if (preset === 'threeMonths') { startDateObj.value = new Date(y, m - 3, now.getDate()); endDateObj.value = now }
  else if (preset === 'ytd') { startDateObj.value = new Date(y, 0, 1); endDateObj.value = now }
  else if (preset === 'oneYear') { startDateObj.value = new Date(y - 1, m, now.getDate()); endDateObj.value = now }
  else { startDateObj.value = new Date(y - 3, m, now.getDate()); endDateObj.value = now }
}

// ── 策略 ──────────────────────────────────────────────────
const strategy = ref<'grid' | 'daily' | 'target'>('grid')

// 網格策略參數
const gridPct = ref(5)          // 網格間距 %
const lotsPerGrid = ref(1)      // 每次交易張數
const initialCapital = ref(1000000)
const isCapitalFocused = ref(false)
const initialLots = ref(0)      // 初始持股張數

// 每日反轉策略參數
const dailyMinBuyPct = ref(1)   // 最小下跌幅度 % 才觸發買入
const dailyMinSellPct = ref(3)  // 最小上漲幅度 % 才觸發賣出
const dailyLots = ref(1)        // 每次交易張數
const dailyInitialLots = ref(0) // 初始持股張數

// 目標報酬策略參數
const targetMinBuyPct = ref(1)   // 收盤比昨收跌 X% 才買入
const targetMinSellPct = ref(3)  // 收盤比該筆買入價漲 X% 才賣出
const targetLots = ref(1)        // 每次交易張數
const targetInitialLots = ref(0) // 初始持股張數

// 手續費
const feeRate = ref(0.1425)
const taxRate = ref(0.1)        // ETF 0.1%；股票 0.3%

const inferTax = computed(() => {
  const c = selectedCode.value.toUpperCase()
  if (/^0\d{4,5}[A-Z]?$/.test(c)) return 0.1
  return 0.3
})

// ── 回測狀態 ─────────────────────────────────────────────
const loading = ref(false)
const error = ref('')

type Trade = {
  date: string
  action: 'buy' | 'sell'
  price: number
  shares: number
  amount: number
  fee: number
  tax: number
  profit: number | null  // sell 時已實現損益（扣費後）
  cashAfter: number
  sharesAfter: number
}

type TradePair = {
  buyDate: string
  buyPrice: number
  sellDate: string
  sellPrice: number
  profit: number
}

type Result = {
  trades: Trade[]
  pairs: TradePair[]
  finalCash: number
  finalShares: number
  finalPrice: number
  finalValue: number
  totalProfit: number
  realizedProfit: number
  unrealizedProfit: number
  totalFee: number
  buyCount: number
  sellCount: number
  winCount: number
  maxDrawdown: number
  annualReturn: number | null
  days: number
  // 診斷
  firstPrice: number
  periodLow: number
  periodHigh: number
  buyTrigger: number
  sellTrigger: number
}

const result = ref<Result | null>(null)

function money(v: number) { return Math.round(v).toLocaleString('zh-TW') }
function pct(v: number) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }
function pctClass(v: number) { return v > 0 ? 'text-red-500' : v < 0 ? 'text-green-600' : 'text-slate-400' }

// ── 網格策略計算 ─────────────────────────────────────────
function runGridStrategy(prices: { date: string; close_price: number }[]): Result {
  const sharesPerLot = 1000
  const sharesPerGrid = lotsPerGrid.value * sharesPerLot
  const fee = feeRate.value / 100
  const tax = taxRate.value / 100

  let cash = initialCapital.value
  let shares = initialLots.value * sharesPerLot

  // 初始持股以第一天價格計算成本
  const firstPrice = prices[0].close_price
  let totalCost = shares * firstPrice  // 初始持股總成本（用於計算未實現損益基準）
  // 初始持股不從現金扣除（假設是帳外資金）

  let refPrice = firstPrice  // 上次觸發的參考價
  let realizedProfit = 0
  let totalFee = 0
  const trades: Trade[] = []
  let buyCount = 0
  let sellCount = 0
  let winCount = 0

  // LIFO cost queue（per share）+ buy stack（per 交易）
  const costQueue: number[] = []
  const buyStack: { date: string; price: number }[] = []  // 每 entry = 1 次買入交易
  if (shares > 0) buyStack.push({ date: prices[0].date, price: firstPrice })
  for (let i = 0; i < shares; i++) costQueue.push(firstPrice)

  let peakValue = cash + shares * firstPrice
  let maxDrawdown = 0
  const pairs: TradePair[] = []

  for (const row of prices) {
    const price = row.close_price
    const currentValue = cash + shares * price
    if (currentValue > peakValue) peakValue = currentValue
    const drawdown = peakValue > 0 ? (peakValue - currentValue) / peakValue * 100 : 0
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    const threshold = gridPct.value / 100

    // 買入條件：價格跌幅 ≥ 網格間距
    if (price <= refPrice * (1 - threshold)) {
      const buyShares = sharesPerGrid
      const amount = price * buyShares
      const feeAmt = Math.max(Math.round(amount * fee), 20)
      const totalCost_ = amount + feeAmt
      if (cash >= totalCost_) {
        cash -= totalCost_
        shares += buyShares
        totalFee += feeAmt
        for (let i = 0; i < buyShares; i++) costQueue.push(price)
        buyStack.push({ date: row.date, price })
        refPrice = price
        buyCount++
        trades.push({
          date: row.date,
          action: 'buy',
          price,
          shares: buyShares,
          amount,
          fee: feeAmt,
          tax: 0,
          profit: null,
          cashAfter: cash,
          sharesAfter: shares,
        })
      }
    }
    // 賣出條件：價格漲幅 ≥ 網格間距
    else if (price >= refPrice * (1 + threshold) && shares >= sharesPerGrid) {
      const sellShares = sharesPerGrid
      const amount = price * sellShares
      const feeAmt = Math.max(Math.round(amount * fee), 20)
      const taxAmt = Math.round(amount * tax)
      cash += amount - feeAmt - taxAmt
      shares -= sellShares
      totalFee += feeAmt + taxAmt

      let costBasis = 0
      for (let i = 0; i < sellShares; i++) costBasis += costQueue.pop() ?? price
      const profit = amount - feeAmt - taxAmt - costBasis

      const buy = buyStack.pop()
      if (buy) pairs.push({ buyDate: buy.date, buyPrice: buy.price, sellDate: row.date, sellPrice: price, profit: Math.round(profit) })

      realizedProfit += profit
      if (profit > 0) winCount++

      refPrice = price
      sellCount++
      trades.push({
        date: row.date,
        action: 'sell',
        price,
        shares: sellShares,
        amount,
        fee: feeAmt + taxAmt,
        tax: taxAmt,
        profit,
        cashAfter: cash,
        sharesAfter: shares,
      })
    }
  }

  const finalPrice = prices[prices.length - 1].close_price
  const finalValue = cash + shares * finalPrice
  const initialValue = initialCapital.value + initialLots.value * sharesPerLot * firstPrice
  const unrealizedProfit = shares > 0
    ? (finalPrice - (costQueue.reduce((a, b) => a + b, 0) / costQueue.length || finalPrice)) * shares
    : 0
  const totalProfit = realizedProfit + unrealizedProfit

  const days = Math.round((new Date(prices[prices.length - 1].date).getTime() - new Date(prices[0].date).getTime()) / 86400000)
  const annualReturn = days > 0 ? ((finalValue / initialValue) ** (365 / days) - 1) * 100 : null

  const allPrices = prices.map(p => p.close_price)
  const periodLow = Math.min(...allPrices)
  const periodHigh = Math.max(...allPrices)
  const threshold = gridPct.value / 100

  return {
    trades,
    pairs,
    finalCash: cash,
    finalShares: shares,
    finalPrice,
    finalValue,
    totalProfit,
    realizedProfit,
    unrealizedProfit,
    totalFee,
    buyCount,
    sellCount,
    winCount,
    maxDrawdown,
    annualReturn,
    days,
    firstPrice,
    periodLow,
    periodHigh,
    buyTrigger: Math.round(firstPrice * (1 - threshold) * 100) / 100,
    sellTrigger: Math.round(firstPrice * (1 + threshold) * 100) / 100,
  }
}

// ── 每日反轉策略計算 ──────────────────────────────────────
function runDailyReversalStrategy(prices: { date: string; close_price: number }[]): Result {
  const sharesPerLot = 1000
  const sharesPerTrade = dailyLots.value * sharesPerLot
  const fee = feeRate.value / 100
  const tax = taxRate.value / 100
  const minBuyThreshold = dailyMinBuyPct.value / 100
  const minSellThreshold = dailyMinSellPct.value / 100

  let cash = initialCapital.value
  let shares = dailyInitialLots.value * sharesPerLot

  const firstPrice = prices[0].close_price
  let realizedProfit = 0
  let totalFee = 0
  const trades: Trade[] = []
  let buyCount = 0
  let sellCount = 0
  let winCount = 0

  const costQueue: number[] = []
  const buyStack: { date: string; price: number }[] = []  // 每 entry = 1 次買入交易
  if (shares > 0) buyStack.push({ date: prices[0].date, price: firstPrice })
  for (let i = 0; i < shares; i++) costQueue.push(firstPrice)

  let peakValue = cash + shares * firstPrice
  let maxDrawdown = 0
  const pairs: TradePair[] = []

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].close_price
    const prevPrice = prices[i - 1].close_price
    const changePct = (price - prevPrice) / prevPrice

    const currentValue = cash + shares * price
    if (currentValue > peakValue) peakValue = currentValue
    const drawdown = peakValue > 0 ? (peakValue - currentValue) / peakValue * 100 : 0
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    // 今天跌（且幅度 >= 最小觸發）→ 買入
    if (changePct < -minBuyThreshold) {
      const amount = price * sharesPerTrade
      const feeAmt = Math.max(Math.round(amount * fee), 20)
      if (cash >= amount + feeAmt) {
        cash -= amount + feeAmt
        shares += sharesPerTrade
        totalFee += feeAmt
        for (let j = 0; j < sharesPerTrade; j++) costQueue.push(price)
        buyStack.push({ date: prices[i].date, price })
        buyCount++
        trades.push({
          date: prices[i].date,
          action: 'buy',
          price,
          shares: sharesPerTrade,
          amount,
          fee: feeAmt,
          tax: 0,
          profit: null,
          cashAfter: cash,
          sharesAfter: shares,
        })
      }
    }
    // 今天漲（且幅度 >= 最小觸發）→ 賣出
    else if (changePct > minSellThreshold && shares >= sharesPerTrade) {
      const amount = price * sharesPerTrade
      const feeAmt = Math.max(Math.round(amount * fee), 20)
      const taxAmt = Math.round(amount * tax)
      cash += amount - feeAmt - taxAmt
      shares -= sharesPerTrade
      totalFee += feeAmt + taxAmt

      let costBasis = 0
      for (let j = 0; j < sharesPerTrade; j++) costBasis += costQueue.pop() ?? price
      const profit = amount - feeAmt - taxAmt - costBasis

      const buy = buyStack.pop()
      if (buy) pairs.push({ buyDate: buy.date, buyPrice: buy.price, sellDate: prices[i].date, sellPrice: price, profit: Math.round(profit) })

      realizedProfit += profit
      if (profit > 0) winCount++

      sellCount++
      trades.push({
        date: prices[i].date,
        action: 'sell',
        price,
        shares: sharesPerTrade,
        amount,
        fee: feeAmt + taxAmt,
        tax: taxAmt,
        profit,
        cashAfter: cash,
        sharesAfter: shares,
      })
    }
  }

  const finalPrice = prices[prices.length - 1].close_price
  const finalValue = cash + shares * finalPrice
  const initialValue = initialCapital.value + dailyInitialLots.value * sharesPerLot * firstPrice
  const unrealizedProfit = shares > 0
    ? (finalPrice - (costQueue.reduce((a, b) => a + b, 0) / costQueue.length || finalPrice)) * shares
    : 0
  const totalProfit = realizedProfit + unrealizedProfit
  const days = Math.round((new Date(prices[prices.length - 1].date).getTime() - new Date(prices[0].date).getTime()) / 86400000)
  const annualReturn = days > 0 ? ((finalValue / initialValue) ** (365 / days) - 1) * 100 : null

  const allPrices = prices.map(p => p.close_price)
  return {
    trades,
    pairs,
    finalCash: cash,
    finalShares: shares,
    finalPrice,
    finalValue,
    totalProfit,
    realizedProfit,
    unrealizedProfit,
    totalFee,
    buyCount,
    sellCount,
    winCount,
    maxDrawdown,
    annualReturn,
    days,
    firstPrice,
    periodLow: Math.min(...allPrices),
    periodHigh: Math.max(...allPrices),
    buyTrigger: 0,
    sellTrigger: 0,
  }
}

// ── 目標報酬策略計算 ──────────────────────────────────────
function runTargetReturnStrategy(prices: { date: string; close_price: number }[]): Result {
  const sharesPerLot = 1000
  const sharesPerTrade = targetLots.value * sharesPerLot
  const fee = feeRate.value / 100
  const tax = taxRate.value / 100
  const minBuyThreshold = targetMinBuyPct.value / 100
  const minSellThreshold = targetMinSellPct.value / 100

  let cash = initialCapital.value
  let shares = targetInitialLots.value * sharesPerLot
  const firstPrice = prices[0].close_price
  let realizedProfit = 0
  let totalFee = 0
  const trades: Trade[] = []
  let buyCount = 0
  let sellCount = 0
  let winCount = 0

  // costQueue per share，buyStack per 交易
  const costQueue: number[] = []
  const buyStack: { date: string; price: number }[] = []
  if (shares > 0) buyStack.push({ date: prices[0].date, price: firstPrice })
  for (let i = 0; i < shares; i++) costQueue.push(firstPrice)

  let peakValue = cash + shares * firstPrice
  let maxDrawdown = 0
  const pairs: TradePair[] = []

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].close_price
    const prevPrice = prices[i - 1].close_price
    const dropPct = (prevPrice - price) / prevPrice  // 正值 = 今天跌

    const currentValue = cash + shares * price
    if (currentValue > peakValue) peakValue = currentValue
    const drawdown = peakValue > 0 ? (peakValue - currentValue) / peakValue * 100 : 0
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    // 賣出優先：有持股 且 最近買入價 * (1 + sellPct) <= 今日收盤
    if (shares >= sharesPerTrade && buyStack.length > 0) {
      const topBuyPrice = buyStack[buyStack.length - 1].price
      if (price >= topBuyPrice * (1 + minSellThreshold)) {
        const amount = price * sharesPerTrade
        const feeAmt = Math.max(Math.round(amount * fee), 20)
        const taxAmt = Math.round(amount * tax)
        cash += amount - feeAmt - taxAmt
        shares -= sharesPerTrade
        totalFee += feeAmt + taxAmt

        let costBasis = 0
        for (let j = 0; j < sharesPerTrade; j++) costBasis += costQueue.pop() ?? price
        const profit = amount - feeAmt - taxAmt - costBasis

        const buy = buyStack.pop()
        if (buy) pairs.push({ buyDate: buy.date, buyPrice: buy.price, sellDate: prices[i].date, sellPrice: price, profit: Math.round(profit) })

        realizedProfit += profit
        if (profit > 0) winCount++
        sellCount++
        trades.push({ date: prices[i].date, action: 'sell', price, shares: sharesPerTrade, amount, fee: feeAmt + taxAmt, tax: taxAmt, profit, cashAfter: cash, sharesAfter: shares })
        continue
      }
    }

    // 買入：今日收盤比昨收跌幅 >= minBuyThreshold
    if (dropPct >= minBuyThreshold) {
      const amount = price * sharesPerTrade
      const feeAmt = Math.max(Math.round(amount * fee), 20)
      if (cash >= amount + feeAmt) {
        cash -= amount + feeAmt
        shares += sharesPerTrade
        totalFee += feeAmt
        for (let j = 0; j < sharesPerTrade; j++) costQueue.push(price)
        buyStack.push({ date: prices[i].date, price })
        buyCount++
        trades.push({ date: prices[i].date, action: 'buy', price, shares: sharesPerTrade, amount, fee: feeAmt, tax: 0, profit: null, cashAfter: cash, sharesAfter: shares })
      }
    }
  }

  const finalPrice = prices[prices.length - 1].close_price
  const finalValue = cash + shares * finalPrice
  const initialValue = initialCapital.value + targetInitialLots.value * sharesPerLot * firstPrice
  const unrealizedProfit = shares > 0
    ? (finalPrice - (costQueue.reduce((a, b) => a + b, 0) / costQueue.length || finalPrice)) * shares
    : 0
  const totalProfit = realizedProfit + unrealizedProfit
  const days = Math.round((new Date(prices[prices.length - 1].date).getTime() - new Date(prices[0].date).getTime()) / 86400000)
  const annualReturn = days > 0 ? ((finalValue / initialValue) ** (365 / days) - 1) * 100 : null
  const allPrices = prices.map(p => p.close_price)

  return {
    trades, pairs, finalCash: cash, finalShares: shares, finalPrice, finalValue,
    totalProfit, realizedProfit, unrealizedProfit, totalFee, buyCount, sellCount, winCount,
    maxDrawdown, annualReturn, days, firstPrice,
    periodLow: Math.min(...allPrices), periodHigh: Math.max(...allPrices),
    buyTrigger: 0, sellTrigger: 0,
  }
}

// ── 執行回測 ─────────────────────────────────────────────
async function runBacktest() {
  if (!selectedCode.value) { error.value = '請選擇股票'; return }
  const s = selectedStock.value
  if (!s || s.count === 0) { error.value = '此股票尚無歷史數據，請先至「更新歷史數據」頁面抓取'; return }

  loading.value = true
  error.value = ''
  result.value = null

  try {
    const data = await $fetch<{ prices: { date: string; close_price: number }[] }>('/api/backtest/prices', {
      headers: authHeaders.value as HeadersInit,
      query: { code: selectedCode.value, startDate: startDate.value, endDate: endDate.value },
    })
    const prices = data.prices ?? []
    if (prices.length < 2) { error.value = '選定期間內資料不足，請調整日期範圍'; return }

    if (strategy.value === 'grid') {
      result.value = runGridStrategy(prices)
    } else if (strategy.value === 'daily') {
      result.value = runDailyReversalStrategy(prices)
    } else if (strategy.value === 'target') {
      result.value = runTargetReturnStrategy(prices)
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? '回測失敗'
  } finally {
    loading.value = false
  }
}

// ── 彈跳視窗 ─────────────────────────────────────────────
const showTradeModal = ref(false)
const modalSortedPairs = computed(() =>
  [...(result.value?.pairs ?? [])].sort((a, b) => a.buyDate.localeCompare(b.buyDate))
)

// ── 分頁 ─────────────────────────────────────────────────
const tradePage = ref(1)
const tradePageSize = 20
const totalTradePages = computed(() => Math.ceil((result.value?.trades.length ?? 0) / tradePageSize))
const pagedTrades = computed(() => {
  const start = (tradePage.value - 1) * tradePageSize
  return (result.value?.trades ?? []).slice(start, start + tradePageSize)
})
watch(result, () => { tradePage.value = 1 })

function goTradePage(p: number) {
  if (p < 1 || p > totalTradePages.value) return
  tradePage.value = p
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="text-lg font-bold text-slate-800">策略回測</h2>
      <p class="text-xs text-slate-400 mt-0.5">選擇股票與策略，模擬歷史交易績效</p>
      <p v-if="updateAllProgress" class="text-xs text-indigo-500 mt-1">{{ updateAllProgress }}</p>
    </div>

    <!-- 設定卡片 -->
    <div class="bg-white rounded-xl border border-slate-200 p-5 space-y-5">

      <!-- 股票選擇 -->
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1.5">選擇股票</label>
        <div class="relative w-full sm:w-72" ref="dropdownRef">
          <input
            v-model="codeSearch"
            type="text"
            placeholder="輸入代碼或名稱搜尋…"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
          />
          <!-- 下拉清單 -->
          <div v-if="showDropdown"
            class="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            <div v-if="filteredStocks.length === 0" class="px-3 py-2 text-xs text-slate-400">無符合結果</div>
            <div
              v-for="s in filteredStocks" :key="s.code"
              class="flex items-center group"
              :class="s.code === selectedCode ? 'bg-indigo-50' : 'hover:bg-slate-50'"
            >
              <!-- 釘選按鈕 -->
              <button
                type="button"
                class="pl-2.5 pr-1 py-2 shrink-0 transition"
                :class="pinnedCodes.includes(s.code) ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300'"
                @mousedown.prevent="togglePin(s.code, $event)"
                title="釘選至最上方"
              >
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
              <!-- 選擇按鈕 -->
              <button
                type="button"
                class="flex-1 flex items-center justify-between px-2 py-2 text-sm text-left"
                :class="s.code === selectedCode ? 'text-indigo-600' : 'text-slate-700'"
                @mousedown.prevent="selectStock(s.code)"
              >
                <span>
                  <span class="font-mono font-medium">{{ s.code }}</span>
                  <span v-if="s.name !== '—'" class="ml-2 text-slate-500">{{ s.name }}</span>
                </span>
                <span v-if="!hasData(s)" class="text-xs text-orange-400 ml-2 shrink-0">無資料</span>
                <span v-else class="text-xs text-slate-300 ml-2 shrink-0">{{ s.count.toLocaleString() }}天</span>
              </button>
            </div>
          </div>
        </div>
        <p v-if="selectedStock && selectedStock.count === 0" class="mt-1.5 text-xs text-orange-500">
          此股票尚無歷史數據，請先前往
          <NuxtLink to="/backtest/history" class="underline text-indigo-500">更新歷史數據</NuxtLink>
          頁面抓取後再回來。
        </p>
        <p v-else-if="selectedStock" class="mt-1 text-xs text-slate-400">
          資料期間：{{ selectedStock.minDate }} ～ {{ selectedStock.maxDate }}（共 {{ selectedStock.count.toLocaleString() }} 個交易日）
        </p>
        <p v-if="stocks.length === 0" class="mt-1.5 text-xs text-slate-400">
          尚無追蹤股票，請先於
          <NuxtLink to="/backtest/history" class="underline text-indigo-500">更新歷史數據</NuxtLink>
          頁面新增股票。
        </p>
      </div>

      <!-- 日期 -->
      <div class="space-y-2">
        <label class="block text-xs font-medium text-slate-600">回測期間</label>
        <ClientOnly>
          <div class="flex items-center gap-2">
            <VDatePicker
              v-model="startDateObj"
              :max-date="endDateObj"
              color="indigo"
              :popover="{ visibility: 'click' }"
            >
              <template #default="{ inputValue, togglePopover }">
                <div>
                  <p class="text-xs text-slate-400 mb-1">起始日期</p>
                  <button type="button" @click="togglePopover"
                    class="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-indigo-300 bg-white cursor-pointer transition">
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    {{ inputValue || '選擇日期' }}
                  </button>
                </div>
              </template>
            </VDatePicker>
            <span class="text-slate-300 mt-4">→</span>
            <VDatePicker
              v-model="endDateObj"
              :min-date="startDateObj"
              :max-date="new Date()"
              color="indigo"
              :popover="{ visibility: 'click' }"
            >
              <template #default="{ inputValue, togglePopover }">
                <div>
                  <p class="text-xs text-slate-400 mb-1">結束日期</p>
                  <button type="button" @click="togglePopover"
                    class="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-indigo-300 bg-white cursor-pointer transition">
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    {{ inputValue || '選擇日期' }}
                  </button>
                </div>
              </template>
            </VDatePicker>
          </div>
          <template #fallback>
            <div class="flex items-center gap-2">
              <div class="h-10 w-36 bg-slate-100 rounded-lg animate-pulse" />
              <span class="text-slate-300">→</span>
              <div class="h-10 w-36 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          </template>
        </ClientOnly>
        <!-- 快捷日期 -->
        <div class="flex flex-wrap gap-1.5">
          <button v-for="preset in [
            { key: 'thisMonth', label: '當月' },
            { key: 'lastMonth', label: '上個月' },
            { key: 'threeMonths', label: '三個月' },
            { key: 'ytd', label: '本年至今' },
            { key: 'oneYear', label: '一年' },
            { key: 'threeYears', label: '三年' },
          ]" :key="preset.key"
            type="button"
            @click="setDateRange(preset.key as any)"
            class="px-2.5 py-1 text-xs text-slate-500 border border-slate-200 rounded-md hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition"
          >{{ preset.label }}</button>
        </div>
      </div>

      <!-- 策略選擇 -->
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-2">交易策略</label>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" v-model="strategy" value="grid" class="accent-indigo-600" />
            <span class="text-sm font-medium text-slate-700">網格策略</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" v-model="strategy" value="daily" class="accent-indigo-600" />
            <span class="text-sm font-medium text-slate-700">每日反轉策略</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" v-model="strategy" value="target" class="accent-indigo-600" />
            <span class="text-sm font-medium text-slate-700">目標報酬策略</span>
          </label>
        </div>
      </div>

      <!-- 網格策略參數 -->
      <div v-if="strategy === 'grid'" class="space-y-4 bg-indigo-50/60 rounded-xl p-4 border border-indigo-100">
        <p class="text-xs font-semibold text-indigo-700 uppercase tracking-wider">網格策略參數</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始資金（元）</label>
            <input
              :value="isCapitalFocused ? initialCapital : initialCapital.toLocaleString('zh-TW')"
              type="text" inputmode="numeric"
              @focus="(e: any) => { isCapitalFocused = true; e.target.value = String(initialCapital) }"
              @blur="(e: any) => { isCapitalFocused = false; const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              @input="(e: any) => { const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始持股（張）</label>
            <input v-model.number="initialLots" type="number" min="0"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">網格間距（%）</label>
            <input v-model.number="gridPct" type="number" min="0.1" max="50" step="0.5"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">每次交易（張）</label>
            <input v-model.number="lotsPerGrid" type="number" min="1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">手續費（%）</label>
            <input v-model.number="feeRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">證交稅（%）</label>
            <input v-model.number="taxRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <p class="text-xs text-slate-400 mt-0.5">ETF 0.1%　股票 0.3%</p>
          </div>
        </div>

        <!-- 策略說明 -->
        <div class="mt-3 bg-white rounded-lg border border-indigo-100 p-3 text-xs text-slate-600 space-y-1.5">
          <p class="font-semibold text-slate-700 mb-1">📋 網格策略運作方式</p>
          <p>• 以每個交易日的<strong>收盤價</strong>作為觸發依據。</p>
          <p>• 設定一個<strong>參考價</strong>（起始為回測第一天收盤價）。</p>
          <p>• 當收盤價跌破「參考價 × (1 − 網格間距%)」時，<strong class="text-indigo-600">買入</strong>指定張數，並以此價更新參考價。</p>
          <p>• 當收盤價突破「參考價 × (1 + 網格間距%)」時，<strong class="text-red-500">賣出</strong>指定張數（需有持股），並以此價更新參考價。</p>
          <p>• 現金不足則略過買入；持股不足則略過賣出。</p>
          <p class="text-slate-400">※ 本回測為簡化模型，不含滑價、流動性限制等實際市場因素。</p>
        </div>
      </div>

      <!-- 每日反轉策略參數 -->
      <div v-if="strategy === 'daily'" class="space-y-4 bg-emerald-50/60 rounded-xl p-4 border border-emerald-100">
        <p class="text-xs font-semibold text-emerald-700 uppercase tracking-wider">每日反轉策略參數</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始資金（元）</label>
            <input
              :value="isCapitalFocused ? initialCapital : initialCapital.toLocaleString('zh-TW')"
              type="text" inputmode="numeric"
              @focus="(e: any) => { isCapitalFocused = true; e.target.value = String(initialCapital) }"
              @blur="(e: any) => { isCapitalFocused = false; const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              @input="(e: any) => { const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始持股（張）</label>
            <input v-model.number="dailyInitialLots" type="number" min="0"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">最小下跌幅度（%）才買入</label>
            <input v-model.number="dailyMinBuyPct" type="number" min="0" max="20" step="0.1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <p class="text-xs text-slate-400 mt-0.5">0 = 只要跌就觸發</p>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">最小上漲幅度（%）才賣出</label>
            <input v-model.number="dailyMinSellPct" type="number" min="0" max="20" step="0.1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <p class="text-xs text-slate-400 mt-0.5">0 = 只要漲就觸發</p>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">每次交易（張）</label>
            <input v-model.number="dailyLots" type="number" min="1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">手續費（%）</label>
            <input v-model.number="feeRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">證交稅（%）</label>
            <input v-model.number="taxRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <p class="text-xs text-slate-400 mt-0.5">ETF 0.1%　股票 0.3%</p>
          </div>
        </div>

        <!-- 策略說明 -->
        <div class="mt-3 bg-white rounded-lg border border-emerald-100 p-3 text-xs text-slate-600 space-y-1.5">
          <p class="font-semibold text-slate-700 mb-1">📋 每日反轉策略運作方式</p>
          <p>• 每個交易日比較<strong>今日收盤價</strong>與<strong>昨日收盤價</strong>。</p>
          <p>• 今天比昨天<strong class="text-indigo-600">跌</strong>（且幅度 ≥ 最小觸發）→ <strong class="text-indigo-600">買入</strong>指定張數（現金不足則略過）。</p>
          <p>• 今天比昨天<strong class="text-red-500">漲</strong>（且幅度 ≥ 最小觸發）→ <strong class="text-red-500">賣出</strong>指定張數（無持股則略過）。</p>
          <p>• 最小觸發幅度設 0 時，只要有漲跌都會觸發；設 1% 時，需漲跌超過 1% 才觸發。</p>
          <p class="text-slate-400">※ 本回測為簡化模型，不含滑價、流動性限制等實際市場因素。</p>
        </div>
      </div>

      <!-- 目標報酬策略參數 -->
      <div v-if="strategy === 'target'" class="space-y-4 bg-violet-50/60 rounded-xl p-4 border border-violet-100">
        <p class="text-xs font-semibold text-violet-700 uppercase tracking-wider">目標報酬策略參數</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始資金（元）</label>
            <input
              :value="isCapitalFocused ? initialCapital : initialCapital.toLocaleString('zh-TW')"
              type="text" inputmode="numeric"
              @focus="(e: any) => { isCapitalFocused = true; e.target.value = String(initialCapital) }"
              @blur="(e: any) => { isCapitalFocused = false; const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              @input="(e: any) => { const n = parseInt(e.target.value.replace(/,/g, '')); if (!isNaN(n)) initialCapital = n }"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">初始持股（張）</label>
            <input v-model.number="targetInitialLots" type="number" min="0"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">最小下跌幅度（%）才買入</label>
            <input v-model.number="targetMinBuyPct" type="number" min="0" max="20" step="0.1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <p class="text-xs text-slate-400 mt-0.5">0 = 只要跌就觸發</p>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">目標獲利幅度（%）才賣出</label>
            <input v-model.number="targetMinSellPct" type="number" min="0" max="100" step="0.1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <p class="text-xs text-slate-400 mt-0.5">相對於該筆買入價</p>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">每次交易（張）</label>
            <input v-model.number="targetLots" type="number" min="1"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">手續費（%）</label>
            <input v-model.number="feeRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">證交稅（%）</label>
            <input v-model.number="taxRate" type="number" min="0" step="0.01"
              class="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <p class="text-xs text-slate-400 mt-0.5">ETF 0.1%　股票 0.3%</p>
          </div>
        </div>

        <!-- 策略說明 -->
        <div class="mt-3 bg-white rounded-lg border border-violet-100 p-3 text-xs text-slate-600 space-y-1.5">
          <p class="font-semibold text-slate-700 mb-1">📋 目標報酬策略運作方式</p>
          <p>• 每個交易日比較<strong>今日收盤價</strong>與<strong>昨日收盤價</strong>。</p>
          <p>• 今天比昨天<strong class="text-indigo-600">跌</strong>（且幅度 ≥ 最小下跌幅度）→ <strong class="text-indigo-600">買入</strong>指定張數（現金不足則略過）。</p>
          <p>• 今天收盤比<strong>該筆買入價</strong>高出 ≥ 目標獲利幅度 → <strong class="text-red-500">賣出</strong>最近一次買入的那批（LIFO）。</p>
          <p>• 賣出優先於買入，同一天若可賣則不買。</p>
          <p class="text-slate-400">※ 本回測為簡化模型，不含滑價、流動性限制等實際市場因素。</p>
        </div>
      </div>

      <!-- 執行按鈕 -->
      <div class="flex items-center gap-3">
        <button @click="runBacktest" :disabled="loading || !selectedCode"
          class="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2">
          <svg :class="loading ? 'animate-spin' : ''" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ loading ? '計算中…' : '執行回測' }}
        </button>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
      </div>
    </div>

    <!-- 回測結果 -->
    <template v-if="result">

      <!-- 診斷列 -->
      <div class="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1.5 items-center">
        <span>📍 起始收盤：<strong class="text-slate-800">{{ result.firstPrice.toLocaleString() }} 元</strong></span>
        <span>📉 買入觸發：<strong :class="result.periodLow <= result.buyTrigger ? 'text-indigo-600' : 'text-orange-500'">{{ result.buyTrigger.toLocaleString() }} 元</strong>
          <span v-if="result.periodLow > result.buyTrigger" class="ml-1 text-orange-400">（期間最低 {{ result.periodLow.toLocaleString() }} 未觸及）</span>
          <span v-else class="ml-1 text-indigo-400">（期間最低 {{ result.periodLow.toLocaleString() }} 已觸及）</span>
        </span>
        <span>📈 賣出觸發：<strong class="text-slate-700">{{ result.sellTrigger.toLocaleString() }} 元</strong></span>
        <span>期間最高：<strong class="text-red-500">{{ result.periodHigh.toLocaleString() }}</strong>　最低：<strong class="text-green-600">{{ result.periodLow.toLocaleString() }}</strong></span>
      </div>

      <!-- 0 交易提示 -->
      <div v-if="result.buyCount === 0 && result.sellCount === 0"
        class="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 text-sm text-orange-700 space-y-1">
        <p class="font-semibold">⚠️ 此期間未觸發任何交易</p>
        <p v-if="result.periodLow > result.buyTrigger">
          股價從未跌破買入觸發線（{{ result.buyTrigger.toLocaleString() }} 元），且初始持股為 0 張無法觸發賣出。
        </p>
        <p>建議：<strong>增加初始持股張數</strong>（讓策略從一開始就有股可賣）、或<strong>縮小網格間距</strong>、或選擇波動較大的區間。</p>
      </div>

      <!-- 統計卡片 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">最終總資產</p>
          <p class="text-lg font-bold text-slate-800">{{ money(result.finalValue) }}</p>
          <p class="text-xs mt-0.5" :class="pctClass(result.totalProfit)">
            {{ result.totalProfit >= 0 ? '+' : '' }}{{ money(result.totalProfit) }} 元
          </p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">已實現損益</p>
          <p class="text-lg font-bold" :class="pctClass(result.realizedProfit)">
            {{ result.realizedProfit >= 0 ? '+' : '' }}{{ money(result.realizedProfit) }}
          </p>
          <p class="text-xs text-slate-400 mt-0.5">勝率 {{ result.sellCount > 0 ? Math.round(result.winCount / result.sellCount * 100) : 0 }}%（{{ result.winCount }}/{{ result.sellCount }}）</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">未實現損益</p>
          <p class="text-lg font-bold" :class="pctClass(result.unrealizedProfit)">
            {{ result.unrealizedProfit >= 0 ? '+' : '' }}{{ money(result.unrealizedProfit) }}
          </p>
          <p class="text-xs text-slate-400 mt-0.5">剩餘 {{ Math.round(result.finalShares / 1000) }} 張 × {{ result.finalPrice.toLocaleString() }} 元</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">年化報酬率</p>
          <p class="text-lg font-bold" :class="result.annualReturn != null ? pctClass(result.annualReturn) : 'text-slate-400'">
            {{ result.annualReturn != null ? pct(result.annualReturn) : '—' }}
          </p>
          <p class="text-xs text-slate-400 mt-0.5">共 {{ result.days }} 天</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">買入次數</p>
          <p class="text-lg font-bold text-indigo-600">{{ result.buyCount }} 次</p>
          <p class="text-xs text-slate-400 mt-0.5">每次 {{ lotsPerGrid }} 張</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">賣出次數</p>
          <p class="text-lg font-bold text-red-500">{{ result.sellCount }} 次</p>
          <p class="text-xs text-slate-400 mt-0.5">每次 {{ lotsPerGrid }} 張</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">最大回撤</p>
          <p class="text-lg font-bold text-orange-500">-{{ result.maxDrawdown.toFixed(2) }}%</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-xs text-slate-400 mb-1">總手續費 + 稅</p>
          <p class="text-lg font-bold text-slate-600">{{ money(result.totalFee) }}</p>
          <p class="text-xs text-slate-400 mt-0.5">剩餘現金 {{ money(result.finalCash) }} 元</p>
        </div>
      </div>

      <!-- 交易明細 -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-700">交易明細</p>
          <div class="flex items-center gap-3">
            <p class="text-xs text-slate-400">共 {{ result.trades.length }} 筆</p>
            <button v-if="result.trades.length > 0"
              @click="showTradeModal = true"
              class="px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
              全部明細
            </button>
          </div>
        </div>
        <div v-if="result.trades.length === 0" class="py-12 text-center text-sm text-slate-400">
          此期間內未觸發任何交易，請考慮縮小網格間距或拉長期間
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-100">
                <th class="text-left px-4 py-2.5 text-xs font-medium text-slate-500">日期</th>
                <th class="text-center px-4 py-2.5 text-xs font-medium text-slate-500">動作</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">成交價</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">股數</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">金額</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">費用+稅</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">已實現損益</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">剩餘現金</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">持股（股）</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              <tr v-for="(t, i) in pagedTrades" :key="i"
                class="hover:bg-slate-50/50 transition">
                <td class="px-4 py-2.5 text-slate-600">{{ t.date }}</td>
                <td class="px-4 py-2.5 text-center">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="t.action === 'buy' ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-600'">
                    {{ t.action === 'buy' ? '買入' : '賣出' }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-right text-slate-700">{{ t.price.toLocaleString('zh-TW') }}</td>
                <td class="px-4 py-2.5 text-right text-slate-600">{{ t.shares.toLocaleString() }}</td>
                <td class="px-4 py-2.5 text-right text-slate-700">{{ money(t.amount) }}</td>
                <td class="px-4 py-2.5 text-right text-slate-400">{{ money(t.fee) }}</td>
                <td class="px-4 py-2.5 text-right font-medium"
                  :class="t.profit != null ? pctClass(t.profit) : 'text-slate-300'">
                  {{ t.profit != null ? (t.profit >= 0 ? '+' : '') + money(t.profit) : '—' }}
                </td>
                <td class="px-4 py-2.5 text-right text-slate-600">{{ money(t.cashAfter) }}</td>
                <td class="px-4 py-2.5 text-right text-slate-600">{{ t.sharesAfter.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>

          <!-- 分頁 -->
          <div v-if="totalTradePages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <p class="text-xs text-slate-400">第 {{ tradePage }} / {{ totalTradePages }} 頁</p>
            <div class="flex items-center gap-1">
              <button @click="goTradePage(1)" :disabled="tradePage === 1"
                class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
              <button @click="goTradePage(tradePage - 1)" :disabled="tradePage === 1"
                class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
              <template v-for="p in totalTradePages" :key="p">
                <button v-if="Math.abs(p - tradePage) <= 2 || p === 1 || p === totalTradePages"
                  @click="goTradePage(p)"
                  class="px-3 py-1 text-xs rounded-lg font-medium transition"
                  :class="p === tradePage ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
                  {{ p }}
                </button>
                <span v-else-if="Math.abs(p - tradePage) === 3" class="px-1 text-slate-300 text-xs">…</span>
              </template>
              <button @click="goTradePage(tradePage + 1)" :disabled="tradePage === totalTradePages"
                class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
              <button @click="goTradePage(totalTradePages)" :disabled="tradePage === totalTradePages"
                class="px-2 py-1 text-xs rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- 全部交易明細 Modal -->
  <Teleport to="body">
    <div v-if="showTradeModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @click.self="showTradeModal = false">
      <div class="absolute inset-0 bg-black/40" @click="showTradeModal = false" />
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p class="text-base font-semibold text-slate-800">全部交易明細</p>
            <p class="text-xs text-slate-400 mt-0.5">{{ selectedCode }} · 依買入日期排序 · 共 {{ modalSortedPairs.length }} 筆配對</p>
          </div>
          <button @click="showTradeModal = false"
            class="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <!-- Table -->
        <div class="overflow-y-auto flex-1">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 z-10">
              <tr class="border-b border-slate-100">
                <th class="text-left px-5 py-2.5 text-xs font-medium text-slate-500">買入日期</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">買入價</th>
                <th class="text-left px-5 py-2.5 text-xs font-medium text-slate-500">賣出日期</th>
                <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">賣出價</th>
                <th class="text-right px-5 py-2.5 text-xs font-medium text-slate-500">獲利（元）</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              <tr v-for="(p, i) in modalSortedPairs" :key="i"
                class="hover:bg-slate-50/60 transition">
                <td class="px-5 py-2.5 text-slate-600">{{ p.buyDate }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-indigo-600">{{ p.buyPrice.toLocaleString('zh-TW') }}</td>
                <td class="px-5 py-2.5 text-slate-600">{{ p.sellDate }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-red-500">{{ p.sellPrice.toLocaleString('zh-TW') }}</td>
                <td class="px-5 py-2.5 text-right font-medium" :class="pctClass(p.profit)">
                  {{ p.profit >= 0 ? '+' : '' }}{{ money(p.profit) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="modalSortedPairs.length === 0" class="py-10 text-center text-sm text-slate-400">尚無已完成的買賣配對</div>
        </div>
        <!-- Footer 小計 -->
        <div class="px-6 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
          <span>已實現損益合計（{{ modalSortedPairs.length }} 筆配對）</span>
          <span class="font-semibold text-sm" :class="pctClass(result!.realizedProfit)">
            {{ result!.realizedProfit >= 0 ? '+' : '' }}{{ money(result!.realizedProfit) }} 元
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.vc-popover-content-wrapper {
  z-index: 9999 !important;
}
</style>
