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

const { updating: updatingAllLatest, progress: updateAllProgress } = useBacktestUpdate()
const loading = ref(false)
const lookingUpFirstDate = ref(false)
const firstDateHint = ref('')
const lastLookupCode = ref('')
const progressText = ref('')
const error = ref('')
const showResult = ref(false)
const prices = ref<PriceRow[]>([])
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
  const shares = Math.floor((initialCapital.value - estimatedBuyFee) / buyPrice)
  const buyAmount = shares * buyPrice
  const buyFee = calcFee(buyAmount)
  const invested = buyAmount + buyFee

  const sellAmount = shares * sellPrice
  const sellFee = calcFee(sellAmount)
  const sellTax = costMode.value === 'none' ? 0 : sellAmount * (taxRate.value / 100)
  const finalValue = sellAmount - sellFee - sellTax
  const profit = finalValue - invested
  const returnPct = invested > 0 ? profit / invested * 100 : null

  return {
    shares,
    buyPrice,
    sellPrice,
    buyAmount,
    buyFee,
    invested,
    sellAmount,
    sellFee,
    sellTax,
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
  progressText.value = '從資料庫讀取回測資料...'

  try {
    const res = await $fetch<any>('/api/backtest/prices', {
      headers: authHeaders.value as HeadersInit,
      query: {
        code: code.value.trim().toUpperCase(),
        startDate: startDate.value,
        endDate: endDate.value,
      },
    })

    prices.value = res.prices ?? []
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
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white border border-slate-200 rounded-xl p-5">
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(180px,250px)_minmax(180px,250px)_minmax(180px,250px)_minmax(180px,250px)_auto] gap-3 lg:items-end">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
            <input v-model="code" type="text" placeholder="例如 2330、0050、009816"
              @blur="lookupFirstDate"
              @keyup.enter="lookupFirstDate"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase" />
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
        <h3 class="text-sm font-semibold text-slate-800 mb-3">配息處理</h3>
        <div class="space-y-2">
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3">
            <input v-model="dividendMode" type="radio" value="cash" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">領現金</span>
              <span class="block text-xs text-slate-500 mt-0.5">配息進入現金部位。此版尚未接配息資料，因此目前不影響計算。</span>
            </span>
          </label>
          <label class="flex gap-3 rounded-lg border border-slate-200 p-3">
            <input v-model="dividendMode" type="radio" value="reinvest" class="mt-1" />
            <span>
              <span class="block text-sm font-medium text-slate-800">再投入</span>
              <span class="block text-xs text-slate-500 mt-0.5">配息後買回同一檔，適合長期總報酬回測；需配息資料後才會生效。</span>
            </span>
          </label>
        </div>
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
        <p class="text-xs text-slate-400 mt-0.5">目前採買進持有模型，買在第一筆價格、賣在最後一筆價格。</p>
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
          <tr>
            <td class="px-5 py-3 text-slate-500">賣出金額 - 手續費 - 交易稅</td>
            <td class="px-5 py-3 text-right font-medium text-slate-800">
              {{ money(result.sellAmount) }} - {{ money(result.sellFee) }} - {{ money(result.sellTax) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
