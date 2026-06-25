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
const updatingPrices = ref(false)
const updatingLatestPrices = ref(false)
const lookingUpFirstDate = ref(false)
const firstDateHint = ref('')
const lastLookupCode = ref('')
const progressText = ref('')
const error = ref('')
const logs = ref<string[]>([])
const prices = ref<PriceRow[]>([])
let lookupTimer: ReturnType<typeof setTimeout> | null = null

const inferredSecurityType = computed<'stock' | 'etf'>(() => {
  const normalizedCode = code.value.trim().toUpperCase()
  if (/^0\d{4,5}[A-Z]?$/.test(normalizedCode)) return 'etf'
  return 'stock'
})
const inferredSecurityLabel = computed(() => inferredSecurityType.value === 'etf' ? 'ETF / 債券 ETF' : '股票')

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

watch(code, (value) => {
  firstDateHint.value = ''
  if (lookupTimer) clearTimeout(lookupTimer)
  const normalizedCode = value.trim().toUpperCase()
  if (normalizedCode.length < 4) return
  lookupTimer = setTimeout(() => lookupFirstDate(), 600)
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
  progressText.value = '正在更新歷史價格資料...'

  try {
    const normalizedCode = code.value.trim().toUpperCase()
    let cursor: string | null = startDate.value
    try {
      cursor = await fetchFirstTradingDate(normalizedCode)
      startDate.value = cursor
      firstDateHint.value = `已自動判斷第一個交易日：${cursor}`
      logs.value.push(`系統判斷開始日期：${cursor}`)
    } catch {
      logs.value.push(`查不到第一個交易日，改用目前開始日期：${startDate.value}`)
    }

    let guard = 0
    while (cursor && guard < 30) {
      const res = await $fetch<any>('/api/backtest/history', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: {
          code: normalizedCode,
          startDate: cursor,
          endDate: endDate.value,
          maxMonths: 24,
        },
      })

      logs.value.push(...(res.logs ?? []))
      prices.value = res.prices ?? []
      progressText.value = `已更新 ${res.monthsProcessed ?? 0} 個月份，資料 ${prices.value.length} 筆`
      cursor = res.nextStartDate
      guard++
    }

    if (!prices.value.length) {
      error.value = '查無歷史價格，請確認股票代號'
    } else if (cursor) {
      logs.value.push('資料區間較長，已先載入部分月份；可再次執行補齊後續資料')
    }

    await loadCurrentRangePrices()
  } catch (e: any) {
    error.value = e?.data?.message ?? '價格資料更新失敗'
  } finally {
    updatingPrices.value = false
    progressText.value = ''
  }
}

async function updateLatestPriceData() {
  if (!code.value.trim()) {
    error.value = '請輸入股票代號'
    return
  }

  updatingLatestPrices.value = true
  error.value = ''
  logs.value = []
  progressText.value = '正在檢查資料庫最新價格...'

  try {
    const normalizedCode = code.value.trim().toUpperCase()
    const latest = await $fetch<{ latestDate: string | null }>('/api/backtest/latest-date', {
      headers: authHeaders.value as HeadersInit,
      query: { code: normalizedCode },
    })
    const updateStart = latest.latestDate ? nextDate(latest.latestDate) : startDate.value

    if (latest.latestDate) {
      if (latest.latestDate >= today) {
        logs.value.push(`DB最新日期：${latest.latestDate}，已是最新資料`)
        await loadCurrentRangePrices()
        return
      }
      logs.value.push(`DB最新日期：${latest.latestDate}，從 ${updateStart} 繼續更新`)
    } else {
      logs.value.push('DB尚無資料，改用目前開始日期更新')
    }

    let cursor: string | null = updateStart
    let guard = 0
    while (cursor && guard < 6) {
      const res = await $fetch<any>('/api/backtest/history', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: {
          code: normalizedCode,
          startDate: cursor,
          endDate: today,
          maxMonths: 6,
        },
      })

      logs.value.push(...(res.logs ?? []))
      progressText.value = `已檢查 ${res.monthsProcessed ?? 0} 個月份`
      cursor = res.nextStartDate
      guard++
    }

    await loadCurrentRangePrices()
    if (!prices.value.length) error.value = '資料庫尚無此代號價格，請先更新區間全部價格'
  } catch (e: any) {
    error.value = e?.data?.message ?? '最新價格更新失敗'
  } finally {
    updatingLatestPrices.value = false
    progressText.value = ''
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white border border-slate-200 rounded-xl p-5">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,300px)_auto_auto] gap-3 lg:items-end pb-8">
        <div class="relative">
          <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
          <input v-model="code" type="text" placeholder="例如 2330、0050、009816"
            @blur="lookupFirstDate"
            @keyup.enter="lookupFirstDate"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase" />
          <p v-if="code.trim().length >= 4 || firstDateHint"
            class="absolute left-0 top-full z-10 mt-1 w-full text-xs text-slate-400 leading-4">
            <span v-if="code.trim().length >= 4">
              系統判斷：{{ inferredSecurityLabel }}
            </span>
            <span v-if="firstDateHint" class="block" :class="lookingUpFirstDate ? 'text-indigo-500' : firstDateHint.includes('已自動') ? 'text-green-600' : 'text-slate-400'">
              {{ firstDateHint }}
            </span>
          </p>
        </div>
        <button @click="updatePriceData" :disabled="updatingPrices"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-60 transition">
          <svg :class="updatingPrices ? 'animate-spin' : ''" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ updatingPrices ? '更新中...' : '更新區間全部價格' }}
        </button>
      </div>
      <p v-if="progressText" class="text-xs text-indigo-500 mt-3">{{ progressText }}</p>
      <p v-if="error" class="text-xs text-red-500 mt-3">{{ error }}</p>
    </div>

    <div v-if="logs.length" class="bg-white border border-slate-200 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-800 mb-3">資料抓取記錄（{{ logs.length }} 筆）</h3>
      <div class="max-h-72 overflow-y-auto space-y-1 text-xs text-slate-500">
        <p v-for="(log, idx) in logs" :key="idx">{{ log }}</p>
      </div>
    </div>
  </div>
</template>
