<script setup lang="ts">
const { authHeaders } = useAuth()
const { data: snapshots, refresh } = await useAuthFetch<any[]>('/api/portfolio/snapshot')
const { data: holdings } = await useAuthFetch<any[]>('/api/stockholdings/summary', { key: 'daily-summary' })

const allRows = computed(() => snapshots.value ?? [])

// 分頁
const pageSize = 10
const currentPage = ref(1)
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
const importDone = ref(false)
const importError = ref('')
const progressLog = ref<{ month: string; tradingDays: number; pricesInserted: number; status: 'pending' | 'running' | 'done' | 'error' }[]>([])
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
  const months = buildMonthList()
  if (!months.length) { alert('尚無交易記錄'); return }

  showModal.value = true
  importDone.value = false
  importError.value = ''
  currentMonthIdx.value = 0
  progressLog.value = months.map(m => ({ month: m.label, tradingDays: 0, pricesInserted: 0, status: 'pending' as const }))

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
      progressLog.value[i].status = 'done'
    } catch (e: any) {
      progressLog.value[i].status = 'error'
      importError.value = `${months[i].label} 失敗：${e?.data?.message ?? '未知錯誤'}`
    }
  }

  importDone.value = true
  await refresh()
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
        <!-- 歷史匯入按鈕 -->
        <button @click="runHistoryImport" :disabled="importing"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition">
          <svg :class="importing ? 'animate-spin' : ''" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {{ importing ? '匯入中…' : '匯入歷史資料' }}
        </button>
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
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-base">匯入歷史資料</h3>
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
            class="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
            :class="item.status === 'running' ? 'bg-indigo-50 border border-indigo-200'
                  : item.status === 'done'    ? 'bg-slate-50'
                  : item.status === 'error'   ? 'bg-red-50'
                  : 'text-slate-300'">
            <div class="flex items-center gap-2">
              <span v-if="item.status === 'running'" class="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block"></span>
              <span v-else-if="item.status === 'done'" class="text-green-500">✓</span>
              <span v-else-if="item.status === 'error'" class="text-red-500">✗</span>
              <span v-else class="w-3 h-3 rounded-full bg-slate-200 inline-block"></span>
              <span :class="item.status === 'pending' ? 'text-slate-400' : 'text-slate-700'">{{ item.month }}</span>
            </div>
            <span v-if="item.status === 'done'" class="text-slate-400">
              {{ item.tradingDays }} 個交易日　{{ item.pricesInserted }} 筆收盤價
            </span>
            <span v-else-if="item.status === 'running'" class="text-indigo-500">抓取中…</span>
          </div>
        </div>

        <div v-if="importError" class="text-xs text-red-500 px-1">{{ importError }}</div>

        <button v-if="importDone" @click="showModal = false"
          class="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition">
          關閉
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div v-if="!allRows.length" class="py-16 text-center text-sm text-slate-400">
        尚無記錄，點上方「匯入歷史資料」或等今日 14:35 自動存入
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">日期</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">總市值</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">當日漲跌</th>
              <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">漲跌幅</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="row in rows" :key="row.date"
              class="hover:bg-slate-50/50 transition">
              <td class="px-5 py-3.5 text-slate-600 font-medium">{{ row.date }}</td>
              <td class="px-5 py-3.5 text-right font-semibold text-slate-800">
                {{ money(row.total_value) }}
              </td>
              <td class="px-5 py-3.5 text-right font-semibold"
                :class="row.daily_change > 0 ? 'text-red-500' : row.daily_change < 0 ? 'text-green-600' : 'text-slate-400'">
                {{ row.daily_change > 0 ? '+' : '' }}{{ money(row.daily_change) }}
              </td>
              <td class="px-5 py-3.5 text-right">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="row.daily_change_pct > 0 ? 'bg-red-50 text-red-600'
                        : row.daily_change_pct < 0 ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-500'">
                  {{ pct(row.daily_change_pct) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

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
  </div>
</template>
