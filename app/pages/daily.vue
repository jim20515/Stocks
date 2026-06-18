<script setup lang="ts">
const { authHeaders } = useAuth()
const { data: snapshots, refresh } = await useAuthFetch<any[]>('/api/portfolio/snapshot')

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

// 歷史匯入
const importing = ref(false)
const importResult = ref<{ datesProcessed?: number; firstDate?: string; lastDate?: string; message?: string } | null>(null)
const importError = ref('')

async function runHistoryImport() {
  if (!confirm('將從第一筆交易日起抓取所有股票歷史收盤價，視持股數量可能需要 1~3 分鐘，確定執行？')) return
  importing.value = true
  importResult.value = null
  importError.value = ''
  try {
    const res = await $fetch<any>('/api/portfolio/history-import', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
    })
    importResult.value = res
    await refresh()
  } catch (e: any) {
    importError.value = e?.data?.message ?? '匯入失敗，請稍後再試'
  } finally {
    importing.value = false
  }
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

    <!-- 匯入結果提示 -->
    <div v-if="importResult" class="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span v-if="importResult.message">{{ importResult.message }}</span>
      <span v-else>
        匯入完成！共 {{ importResult.datesProcessed }} 個交易日（{{ importResult.firstDate }} ～ {{ importResult.lastDate }}）
      </span>
    </div>
    <div v-if="importError" class="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {{ importError }}
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
