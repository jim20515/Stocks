<script setup lang="ts">
const { authHeaders } = useAuth()
const { isGuest, promptLogin } = useGuestGate()

// Tooltip
const tooltip = ref<{ text: string; x: number; y: number } | null>(null)
function showTip(e: MouseEvent, text: string) {
  // 估算 tooltip 寬度（每字約 7px + padding 20px）
  const estimatedWidth = text.length * 7 + 20
  const x = e.clientX + estimatedWidth + 10 > window.innerWidth
    ? e.clientX - estimatedWidth - 10   // 超出右邊 → 往左顯示
    : e.clientX + 10
  const y = e.clientY - 36 < 0
    ? e.clientY + 20                     // 超出頂部 → 往下顯示
    : e.clientY - 36
  tooltip.value = { text, x, y }
}
function hideTip() { tooltip.value = null }
// 手機無 hover：點擊切換顯示，數秒後自動收起
let tipTimer: any = null
function toggleTip(e: MouseEvent, text: string) {
  clearTimeout(tipTimer)
  if (tooltip.value?.text === text) { hideTip(); return }
  showTip(e, text)
  tipTimer = setTimeout(hideTip, 4000)
}
const { data: snapshots, refresh } = await useAppData<any[]>('/api/portfolio/snapshot', {}, DEMO_SNAPSHOTS)
usePullToRefresh(refresh)
const { data: holdings } = await useAppData<any>('/api/stockholdings/summary', { key: 'daily-summary' }, DEMO_SUMMARY)

const allRows = computed(() => {
  const raw = [...(snapshots.value ?? [])].reverse() // 由舊到新

  const withCalc = raw.map((row, i) => {
    const totalValue = Number(row.total_value)
    const totalCost  = Number(row.total_cost ?? 0)
    const totalProfit = totalValue - totalCost  // 總漲跌

    const prevRow = i > 0 ? raw[i - 1] : null
    const prevValue = prevRow ? Number(prevRow.total_value) : null

    // 當日漲跌 = 今日市值 - 昨日市值 - 當日買賣（排除資金進出，純反映股價漲跌）
    const dailyTradeAmount = Number(row.daily_trade_amount ?? 0)
    const dailyChange = prevValue !== null
      ? Math.round(totalValue - prevValue - dailyTradeAmount)
      : null
    const dailyChangePct = (dailyChange !== null && prevValue && prevValue > 0)
      ? Math.round(dailyChange / prevValue * 10000) / 100
      : null
    const totalProfitPct = totalCost > 0
      ? Math.round(totalProfit / totalCost * 10000) / 100
      : null

    return { ...row, total_profit: totalProfit, daily_change: dailyChange, daily_change_pct: dailyChangePct, total_profit_pct: totalProfitPct, cum_profit: 0 }
  })

  // 累積獲利 = 每日漲跌的累積加總
  let cumProfit = 0
  for (const row of withCalc) {
    cumProfit += row.daily_change ?? 0
    row.cum_profit = Math.round(cumProfit)
  }

  return withCalc.reverse() // 由新到舊顯示
})

// 分頁
const pageSize = 10
const currentPage = ref(1)
const refreshing = ref(false)

const totalPages = computed(() => Math.ceil(allRows.value.length / pageSize))
const rows = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return allRows.value.slice(start, start + pageSize)
})
function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

function money(v: any) { return Number(v).toLocaleString('zh-TW') }
function pct(v: any) {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + Number(v).toFixed(2) + '%'
}

// 歷史匯入進度
const showModal = ref(false)
const expandedLog = ref<string | null>(null)
const importing = ref(false)
const importDone = ref(false)
const importError = ref('')
const progressLog = ref<{ month: string; tradingDays: number; pricesInserted: number; pricesTotal: number; status: 'pending' | 'running' | 'done' | 'error'; debugLog?: string[] }[]>([])
const currentMonthIdx = ref(0)

function buildMonthList(): { year: number; month: number; label: string }[] {
  const items = (holdings.value as any)?.items ?? []
  if (!items.length) return []
  const dates = items.map((h: any) => h.buyDate).filter(Boolean).sort()
  if (!dates.length) return []

  const first = new Date(dates[0])
  const today = new Date()
  const months = []
  const cur = new Date(first.getFullYear(), first.getMonth(), 1)
  while (cur <= today) {
    months.push({
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      label: `${cur.getFullYear()} 年 ${String(cur.getMonth() + 1).padStart(2, '0')} 月`,
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

async function runHistoryImport() {
  if (isGuest.value) return promptLogin()
  const months = buildMonthList()
  if (!months.length) { alert('尚無交易記錄'); return }

  importing.value = true
  showModal.value = true
  importDone.value = false
  importError.value = ''
  currentMonthIdx.value = 0
  progressLog.value = months.map(m => ({ month: m.label, tradingDays: 0, pricesInserted: 0, pricesTotal: 0, status: 'pending' as const }))

  for (let i = 0; i < months.length; i++) {
    currentMonthIdx.value = i
    progressLog.value[i].status = 'running'

    try {
      const res = await $fetch<any>('/api/portfolio/history-import', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: { year: months[i].year, month: months[i].month },
      })
      progressLog.value[i].tradingDays = res.tradingDays ?? 0
      progressLog.value[i].pricesInserted = res.pricesInserted ?? 0
      progressLog.value[i].pricesTotal = res.pricesTotal ?? 0
      progressLog.value[i].debugLog = res.debug ?? []
      progressLog.value[i].status = 'done'
    } catch (e: any) {
      progressLog.value[i].status = 'error'
      importError.value = `${months[i].label} 失敗：${e?.data?.message ?? '未知錯誤'}`
    }
  }


  importDone.value = true
  importing.value = false
  await refreshWithSnapshot()
}

async function refreshWithSnapshot() {
  refreshing.value = true
  try {
    // 找最後一筆記錄日期，從隔月開始補齊到今天
    const existingRows = (snapshots.value ?? []) as any[]
    const lastDate = existingRows.length
      ? existingRows.reduce((a: string, b: any) => (b.date > a ? b.date : a), existingRows[0].date)
      : null

    const today = new Date()
    const startFrom = lastDate
      ? new Date(lastDate)
      : (() => {
          const items = (holdings.value as any)?.items ?? []
          const dates = items.map((h: any) => h.buyDate).filter(Boolean).sort()
          return dates.length ? new Date(dates[0]) : today
        })()

    // 從 lastDate 當月開始（包含最後記錄那個月，讓它補齊當月剩餘天數）
    const cur = new Date(startFrom.getFullYear(), startFrom.getMonth(), 1)
    const monthsToFill: { year: number; month: number }[] = []
    while (cur <= today) {
      monthsToFill.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
      cur.setMonth(cur.getMonth() + 1)
    }

    for (const { year, month } of monthsToFill) {
      await $fetch('/api/portfolio/history-import', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: { year, month },
      })
    }

    // 最後補一次今天即時價格
    await $fetch('/api/portfolio/snapshot', { method: 'POST', headers: authHeaders.value as HeadersInit })
  } catch {}
  await refresh()
  refreshing.value = false
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-bold text-slate-800">每日漲幅</h2>
        <p class="text-xs text-slate-400 mt-0.5">每個交易日 14:35 自動記錄</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- 抓取當天數值 -->
        <div class="relative group">
          <button @click="refreshWithSnapshot" :disabled="refreshing"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
            <svg :class="refreshing ? 'animate-spin' : ''" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0" />
            </svg>
            {{ refreshing ? '補齊中…' : '補齊至今日' }}
          </button>
          <div class="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block bg-slate-800 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none max-w-xs leading-5">
            從最後一筆快照記錄的日期開始，補齊中間每個交易日的市值與漲跌，最後抓取今日即時價格。平時只需要按這個就好。
          </div>
        </div>
        <!-- 歷史匯入按鈕 -->
        <div class="relative group">
          <button @click="runHistoryImport" :disabled="importing"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition">
            <svg :class="importing ? 'animate-spin' : ''" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {{ importing ? '計算中…' : '重算所有歷史' }}
          </button>
          <div class="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block bg-slate-800 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none max-w-xs leading-5">
            從第一筆交易日起，重新計算所有歷史每日市值與漲跌。當你新增、修改或刪除過去的交易記錄時使用，時間較長請耐心等待。
          </div>
        </div>
        <!-- 重新整理 -->
        <button @click="refresh"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新整理
        </button>
      </div>
    </div>

    <!-- 進度 Modal -->
    <BottomSheet :model-value="showModal" max-width="max-w-md" :persistent="!importDone"
      @update:model-value="showModal = false">
      <div class="p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-base">重新計算歷史資料</h3>
          <span v-if="!importDone" class="text-xs text-slate-400 animate-pulse">處理中…</span>
          <span v-else class="text-xs text-green-600 font-medium">✓ 完成</span>
        </div>

        <!-- 總進度條 -->
        <div class="w-full bg-slate-100 rounded-full h-2">
          <div class="bg-indigo-500 h-2 rounded-full transition-all duration-300"
            :style="{ width: progressLog.length ? ((currentMonthIdx + (importDone ? 1 : 0)) / progressLog.length * 100) + '%' : '0%' }">
          </div>
        </div>
        <p class="text-xs text-slate-500 text-center">
          {{ importDone ? progressLog.length : currentMonthIdx + 1 }} / {{ progressLog.length }} 個月份
        </p>

        <!-- 月份列表 -->
        <div class="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          <div v-for="(item, idx) in progressLog" :key="idx"
            class="px-3 py-2 rounded-lg text-xs"
            :class="item.status === 'running' ? 'bg-indigo-50 border border-indigo-200'
                  : item.status === 'done'    ? 'bg-slate-50'
                  : item.status === 'error'   ? 'bg-red-50'
                  : 'text-slate-300'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span v-if="item.status === 'running'" class="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block"></span>
                <span v-else-if="item.status === 'done'" class="text-green-500">✓</span>
                <span v-else-if="item.status === 'error'" class="text-red-500">✗</span>
                <span v-else class="w-3 h-3 rounded-full bg-slate-200 inline-block"></span>
                <span :class="item.status === 'pending' ? 'text-slate-400' : 'text-slate-700'">{{ item.month }}</span>
              </div>
              <span v-if="item.status === 'done'" class="text-slate-400">
                {{ item.tradingDays }} 個交易日
                <template v-if="item.pricesTotal > 0">
                  　{{ item.pricesTotal }} 筆收盤價
                  <span v-if="item.pricesInserted > 0" class="text-indigo-400">（新增 {{ item.pricesInserted }}）</span>
                  <span v-else class="text-slate-300">（已有）</span>
                </template>
                <template v-else>　—</template>
                <span v-if="item.debugLog?.length"
                  class="ml-1 text-orange-400 cursor-pointer underline"
                  @click="expandedLog = expandedLog === item.month ? null : item.month">詳細</span>
              </span>
              <span v-else-if="item.status === 'running'" class="text-indigo-500">抓取中…</span>
            </div>
            <div v-if="expandedLog === item.month && item.debugLog?.length"
              class="mt-2 ml-5 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-2 space-y-0.5">
              <div v-for="(log, li) in item.debugLog" :key="li">{{ log }}</div>
            </div>
          </div>
        </div>

        <div v-if="importError" class="text-xs text-red-500 px-1">{{ importError }}</div>

        <button v-if="importDone" @click="showModal = false"
          class="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition">
          關閉
        </button>
      </div>
    </BottomSheet>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div v-if="!allRows.length" class="py-16 text-center text-sm text-slate-400">
        尚無記錄，點上方「重新計算歷史資料」或等今日 14:35 自動存入
      </div>

      <div v-else>
        <div class="hidden sm:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">日期</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">總市值</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">總成本
                  <span class="formula-tip" @mouseover="showTip($event, '買入＋買入金額，賣出−當時均成本（WACC）')" @mouseleave="hideTip" @click.stop="toggleTip($event, '買入＋買入金額，賣出−當時均成本（WACC）')">?</span>
                </span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">當日買賣</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">當日漲跌
                  <span class="formula-tip" @mouseover="showTip($event, '今日市值 − 昨日市值 − 當日買賣（純股價漲跌，不含資金進出）')" @mouseleave="hideTip" @click.stop="toggleTip($event, '今日市值 − 昨日市值 − 當日買賣（純股價漲跌，不含資金進出）')">?</span>
                </span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">漲跌幅
                  <span class="formula-tip" @mouseover="showTip($event, '當日漲跌 ÷ 昨日總市值 × 100%')" @mouseleave="hideTip" @click.stop="toggleTip($event, '當日漲跌 ÷ 昨日總市值 × 100%')">?</span>
                </span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">總漲跌
                  <span class="formula-tip" @mouseover="showTip($event, '總市值 − 總成本（含未實現＋已實現損益）')" @mouseleave="hideTip" @click.stop="toggleTip($event, '總市值 − 總成本（含未實現＋已實現損益）')">?</span>
                </span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">總漲跌幅
                  <span class="formula-tip" @mouseover="showTip($event, '總漲跌 ÷ 總成本 × 100%')" @mouseleave="hideTip" @click.stop="toggleTip($event, '總漲跌 ÷ 總成本 × 100%')">?</span>
                </span>
              </th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">
                <span class="inline-flex items-center gap-1 justify-end">累積獲利
                  <span class="formula-tip" @mouseover="showTip($event, '每日漲跌的累積加總（純股價漲跌貢獻）')" @mouseleave="hideTip" @click.stop="toggleTip($event, '每日漲跌的累積加總（純股價漲跌貢獻）')">?</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="row in rows" :key="row.date"
              class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5 text-slate-600 font-medium">{{ row.date }}</td>
              <td class="px-5 py-3.5 text-right font-semibold text-slate-800">
                {{ money(row.total_value) }}
              </td>
              <td class="px-5 py-3.5 text-right text-slate-600">
                {{ money(row.total_cost) }}
              </td>
              <td class="px-5 py-3.5 text-right font-semibold"
                :class="row.daily_trade_amount > 0 ? 'text-red-500' : row.daily_trade_amount < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ row.daily_trade_amount !== 0 ? (row.daily_trade_amount > 0 ? '+' : '') + money(row.daily_trade_amount) : '—' }}
              </td>
              <td class="px-5 py-3.5 text-right font-semibold"
                :class="row.daily_change > 0 ? 'text-red-500' : row.daily_change < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ row.daily_change !== null ? (row.daily_change > 0 ? '+' : '') + money(row.daily_change) : '—' }}
              </td>
              <td class="px-5 py-3.5 text-right">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="row.daily_change_pct > 0 ? 'bg-red-50 text-red-600'
                        : row.daily_change_pct < 0 ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-500'">
                  {{ pct(row.daily_change_pct) }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right font-semibold"
                :class="row.total_profit > 0 ? 'text-red-500' : row.total_profit < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ row.total_profit > 0 ? '+' : '' }}{{ money(row.total_profit) }}
              </td>
              <td class="px-5 py-3.5 text-right">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="row.total_profit_pct > 0 ? 'bg-red-50 text-red-600'
                        : row.total_profit_pct < 0 ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-500'">
                  {{ pct(row.total_profit_pct) }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right font-semibold"
                :class="row.cum_profit > 0 ? 'text-red-500' : row.cum_profit < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ row.cum_profit > 0 ? '+' : '' }}{{ money(row.cum_profit) }}
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <!-- 手機卡片 -->
        <div class="sm:hidden divide-y divide-slate-100">
          <div v-for="row in rows" :key="row.date" class="p-4">
            <div class="flex items-start justify-between gap-2 mb-2.5">
              <p class="font-semibold text-slate-700">{{ row.date }}</p>
              <div class="text-right">
                <p class="font-semibold" :class="row.daily_change > 0 ? 'text-red-500' : row.daily_change < 0 ? 'text-green-600' : 'text-slate-400'">{{ row.daily_change !== null ? (row.daily_change > 0 ? '+' : '') + money(row.daily_change) : '—' }}</p>
                <p class="text-xs" :class="row.daily_change_pct > 0 ? 'text-red-500' : row.daily_change_pct < 0 ? 'text-green-600' : 'text-slate-400'">{{ pct(row.daily_change_pct) }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div class="flex justify-between gap-2"><span class="text-slate-400">總市值</span><span class="text-slate-800 font-medium">{{ money(row.total_value) }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-slate-400">總成本</span><span class="text-slate-600">{{ money(row.total_cost) }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-slate-400">當日買賣</span><span :class="row.daily_trade_amount > 0 ? 'text-red-500' : row.daily_trade_amount < 0 ? 'text-green-600' : 'text-slate-400'">{{ row.daily_trade_amount !== 0 ? (row.daily_trade_amount > 0 ? '+' : '') + money(row.daily_trade_amount) : '—' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-slate-400">總漲跌</span><span :class="row.total_profit > 0 ? 'text-red-500' : row.total_profit < 0 ? 'text-green-600' : 'text-slate-400'">{{ row.total_profit > 0 ? '+' : '' }}{{ money(row.total_profit) }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-slate-400">總漲跌幅</span><span :class="row.total_profit_pct > 0 ? 'text-red-500' : row.total_profit_pct < 0 ? 'text-green-600' : 'text-slate-400'">{{ pct(row.total_profit_pct) }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-slate-400">累積獲利</span><span :class="row.cum_profit > 0 ? 'text-red-500' : row.cum_profit < 0 ? 'text-green-600' : 'text-slate-400'">{{ row.cum_profit > 0 ? '+' : '' }}{{ money(row.cum_profit) }}</span></div>
            </div>
          </div>
        </div>

        <!-- 分頁 -->
        <div v-if="totalPages > 1" class="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <p class="text-xs text-slate-400">
            共 {{ allRows.length }} 筆，第 {{ currentPage }} / {{ totalPages }} 頁
          </p>
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
    </div>
    <Teleport to="body">
      <div v-if="tooltip" class="fixed z-[9999] pointer-events-none px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs rounded-lg shadow-lg whitespace-nowrap"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        {{ tooltip.text }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.formula-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #6366f1;
  color: white;
  font-size: 9px;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
}
</style>
