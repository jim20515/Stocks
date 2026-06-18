<script setup lang="ts">
const { data: snapshots, refresh } = await useAuthFetch<any[]>('/api/portfolio/snapshot')

const rows = computed(() => snapshots.value ?? [])

function money(v: any) { return Number(v).toLocaleString('zh-TW') }
function pct(v: any) {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + Number(v).toFixed(2) + '%'
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-slate-800">每日漲幅</h2>
        <p class="text-xs text-slate-400 mt-0.5">每個交易日 14:35 自動記錄，最近 90 天</p>
      </div>
      <button @click="refresh"
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        重新整理
      </button>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-slate-400">
        尚無記錄，第一筆資料將在今日 14:35 收盤後自動儲存
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
      </div>
    </div>
  </div>
</template>
