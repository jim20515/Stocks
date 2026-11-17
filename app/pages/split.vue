<script setup lang="ts">
import BottomSheet from '~~/app/components/BottomSheet.vue'

useHead({ title: '股票分割管理' })

const { authHeaders } = useAuth()
const { isGuest, promptLogin } = useGuestGate()
const toast = useToast()

interface SplitRecord {
  id: string | number
  stock_code: string
  stock_name: string
  split_date: string
  resume_date?: string | null
  ratio: number
  adjust_daily_prices: boolean
  holdings_count: number
  daily_prices_count: number
  status: 'applied' | 'reverted'
  created_at: string
  reverted_at?: string | null
}

interface SplitPreview {
  stockCode: string
  stockName: string
  splitDate: string
  resumeDate?: string | null
  ratio: number
  holdingsCount: number
  currentShares: number
  newShares: number
  currentCost: number
  newAverageCostPreview: number
  dailyPricesCount: number
  snapshotsCount?: number
  sampleHoldings: Array<{
    id: number
    account: string | null
    buyDate: string
    origShares: number
    afterShares: number
    origCost: number
    afterCost: number
  }>
}

// ── 表單狀態 ──
const form = ref({
  stockCode: '00662',
  stockName: '富邦NASDAQ',
  splitDate: '2026-11-10',
  resumeDate: '',
  ratio: 5,
  adjustDailyPrices: true,
})

const loadingPreview = ref(false)
const applying = ref(false)
const reverting = ref(false)
const previewData = ref<SplitPreview | null>(null)
const previewError = ref('')

// ── 彈窗狀態 ──
const showConfirmModal = ref(false)
const showRevertModal = ref(false)
const targetRevertRecord = ref<SplitRecord | null>(null)

// ── 載入現有分割歷史 ──
const { data: historyRes, refresh: refreshHistory } = await useAuthFetch<{ ok: boolean; list: SplitRecord[] }>(
  '/api/split/history',
  { key: 'split-history' }
)
const splitHistory = computed(() => historyRes.value?.list || [])

// ── 載入現有使用者持股清單（供下拉快捷選取） ──
const { data: summaryData } = await useAuthFetch<any>('/api/stockholdings/summary', { key: 'split-summary' })
const userStockCodes = computed(() => {
  const list = summaryData.value?.byCode || []
  return list.map((item: any) => ({
    code: item.stockCode,
    name: item.stockName,
    shares: item.shares,
  }))
})

function selectQuickCode(code: string, name: string) {
  form.value.stockCode = code
  form.value.stockName = name
  previewData.value = null
  previewError.value = ''
}

// 格式化數字千分位
function fmtNum(val: number | string | null | undefined): string {
  const n = Number(val)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-TW')
}

// 格式化日期時間
function fmtDateTime(str: string | null | undefined): string {
  if (!str) return '-'
  try {
    return new Date(str).toLocaleString('zh-TW', { hour12: false })
  } catch {
    return str
  }
}

// ── 試算預覽 ──
async function handlePreview() {
  if (isGuest.value) return promptLogin()
  if (!form.value.stockCode.trim()) {
    previewError.value = '請輸入股票代號'
    return
  }
  if (Number(form.value.ratio) <= 0) {
    previewError.value = '分割倍數必須大於 0'
    return
  }

  loadingPreview.value = true
  previewError.value = ''
  previewData.value = null

  try {
    const res = await $fetch<SplitPreview>('/api/split/preview', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: {
        stockCode: form.value.stockCode.trim(),
        splitDate: form.value.splitDate,
        resumeDate: form.value.resumeDate ? form.value.resumeDate : undefined,
        ratio: Number(form.value.ratio),
        adjustDailyPrices: form.value.adjustDailyPrices,
      },
    })
    previewData.value = res
    if (res.stockName) form.value.stockName = res.stockName
    if (res.holdingsCount === 0) {
      previewError.value = `在 ${form.value.splitDate}（含）前查無 ${form.value.stockCode} 的持股單據，請確認基準日是否正確。`
    }
  } catch (err: any) {
    previewError.value = err?.data?.message || err?.message || '試算失敗'
  } finally {
    loadingPreview.value = false
  }
}

// ── 開啟套用確認 ──
function openConfirmApply() {
  if (!previewData.value || previewData.value.holdingsCount === 0) return
  showConfirmModal.value = true
}

// ── 執行套用 ──
async function executeApply() {
  if (isGuest.value) return promptLogin()
  applying.value = true
  try {
    const res = await $fetch<any>('/api/split/apply', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: {
        stockCode: form.value.stockCode.trim(),
        stockName: form.value.stockName,
        splitDate: form.value.splitDate,
        resumeDate: form.value.resumeDate ? form.value.resumeDate : undefined,
        ratio: Number(form.value.ratio),
        adjustDailyPrices: form.value.adjustDailyPrices,
      },
    })
    toast.success(res.message || '分割執行成功！')
    showConfirmModal.value = false
    previewData.value = null
    await Promise.all([refreshHistory(), summaryData.value ? refreshNuxtData('split-summary') : Promise.resolve()])
  } catch (err: any) {
    toast.error(err?.data?.message || err?.message || '執行分割失敗')
  } finally {
    applying.value = false
  }
}

// ── 開啟還原確認 ──
function openRevert(record: SplitRecord) {
  targetRevertRecord.value = record
  showRevertModal.value = true
}

// ── 執行還原 ──
async function executeRevert() {
  if (!targetRevertRecord.value) return
  if (isGuest.value) return promptLogin()
  reverting.value = true
  try {
    const res = await $fetch<any>('/api/split/revert', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: {
        splitId: targetRevertRecord.value.id,
      },
    })
    toast.success(res.message || '還原成功！')
    showRevertModal.value = false
    targetRevertRecord.value = null
    await Promise.all([refreshHistory(), summaryData.value ? refreshNuxtData('split-summary') : Promise.resolve()])
  } catch (err: any) {
    toast.error(err?.data?.message || err?.message || '還原失敗')
  } finally {
    reverting.value = false
  }
}
</script>

<template>
  <div class="space-y-6 pb-12">
    <!-- 頂部標題與說明卡片 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-800">股票分割管理</h1>
          <p class="text-xs text-slate-500 mt-0.5">
            處理台美股 ETF 股票分割（如 00662 進行 1 拆 5）。系統會自動調整持股單據股數與均價，並同步還原歷史收盤價。
          </p>
        </div>
      </div>

      <div class="mt-4 p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
        <svg class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <span class="font-semibold">安心防呆機制：</span>
          系統每次執行分割皆會完整備份當前的每一筆持股與價格快照。若數值輸入錯誤或重複點擊，隨時可於下方紀錄區點擊「一鍵還原」回復原貌。
        </div>
      </div>
    </div>

    <!-- 區塊一：分割參數設定與試算 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-2 h-4 bg-indigo-600 rounded-full inline-block"></span>
        設定分割條件
      </h2>

      <!-- 快捷持股按鈕 -->
      <div v-if="userStockCodes.length > 0" class="mb-4">
        <span class="text-xs text-slate-400 mb-1.5 block">目前持股快速帶入：</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="stk in userStockCodes"
            :key="stk.code"
            type="button"
            @click="selectQuickCode(stk.code, stk.name)"
            class="px-2.5 py-1 text-xs rounded-lg border transition-colors flex items-center gap-1"
            :class="form.stockCode === stk.code ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'"
          >
            <span>{{ stk.code }}</span>
            <span class="text-slate-400">({{ stk.name }})</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 欄位 1：股票代號 -->
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">
            股票代號 <span class="text-red-500">*</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="form.stockCode"
              type="text"
              placeholder="例：00662"
              class="w-full px-3 py-2 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @input="previewData = null"
            />
          </div>
        </div>

        <!-- 欄位 2：分割基準日 -->
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">
            分割基準日 (最後交易日) <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.splitDate"
            type="date"
            class="w-full px-3 py-2 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @change="previewData = null"
          />
          <p class="text-[11px] text-slate-400 mt-1">基準日（含）前的買入單據受分割影響</p>
        </div>

        <!-- 欄位 3：新股恢復交易日（選填） -->
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">
            新股恢復交易日 <span class="text-slate-400 text-[11px] font-normal">(選填)</span>
          </label>
          <input
            v-model="form.resumeDate"
            type="date"
            class="w-full px-3 py-2 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @change="previewData = null"
          />
          <p class="text-[11px] text-slate-400 mt-1">停牌結束日。系統依此校正快照避免停牌跳水</p>
        </div>

        <!-- 欄位 4：分割倍數 -->
        <div>
          <label class="block text-xs font-medium text-slate-700 mb-1">
            分割倍數 (1 拆 N) <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <input
              v-model.number="form.ratio"
              type="number"
              step="any"
              min="0.1"
              placeholder="例：5"
              class="w-full px-3 py-2 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @input="previewData = null"
            />
            <span class="absolute right-3 top-2.5 text-xs text-slate-400">倍</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">1 拆 5 請填 5（股數 ×5、均價 ÷5）</p>
        </div>
      </div>

      <!-- 同步收盤價選項 -->
      <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            v-model="form.adjustDailyPrices"
            type="checkbox"
            class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            @change="previewData = null"
          />
          <span>同步還原基準日前的歷史日收盤價 (stock_daily_prices)</span>
          <span class="text-[11px] text-slate-400">（推薦勾選，避免資產回測與走勢圖跳空）</span>
        </label>

        <button
          type="button"
          @click="handlePreview"
          :disabled="loadingPreview"
          class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
        >
          <svg v-if="loadingPreview" class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>{{ loadingPreview ? '試算中…' : '試算預覽' }}</span>
        </button>
      </div>

      <!-- 錯誤提示 -->
      <div v-if="previewError" class="mt-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
        {{ previewError }}
      </div>

      <!-- 試算結果預覽卡片 -->
      <div v-if="previewData" class="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>{{ previewData.stockCode }}</span>
              <span>{{ previewData.stockName }}</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] bg-indigo-100 text-indigo-700 font-normal">
                1 拆 {{ previewData.ratio }} 試算結果
              </span>
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              基準日：{{ previewData.splitDate }} ｜
              復牌日：{{ previewData.resumeDate || '同基準日' }} ｜
              影響持股單據：{{ previewData.holdingsCount }} 筆 ｜
              連動校正快照：{{ previewData.snapshotsCount ?? 0 }} 筆 ｜
              影響歷史日線：{{ previewData.dailyPricesCount }} 筆
            </p>
          </div>

          <button
            type="button"
            @click="openConfirmApply"
            class="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
          >
            確認並執行分割
          </button>
        </div>

        <!-- 數據對比方塊 -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <span class="text-slate-400 block mb-1">分割前總股數</span>
            <span class="text-sm font-semibold text-slate-700">{{ fmtNum(previewData.currentShares) }} 股</span>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <span class="text-slate-400 block mb-1">分割後總股數 (×{{ previewData.ratio }})</span>
            <span class="text-sm font-semibold text-indigo-600 font-bold">{{ fmtNum(previewData.newShares) }} 股</span>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <span class="text-slate-400 block mb-1">分割後預估均價 (÷{{ previewData.ratio }})</span>
            <span class="text-sm font-semibold text-indigo-600 font-bold">${{ previewData.newAverageCostPreview }} 元</span>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <span class="text-slate-400 block mb-1">持股總成本變動</span>
            <span class="text-sm font-semibold text-slate-700">${{ fmtNum(previewData.currentCost) }} 元 (持平)</span>
          </div>
        </div>

        <!-- 抽樣單據明細預覽 -->
        <div v-if="previewData.sampleHoldings.length > 0">
          <span class="text-[11px] text-slate-400 block mb-1.5">單據換算抽樣對比（前 5 筆）：</span>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left text-slate-600">
              <thead class="text-[11px] text-slate-400 border-b border-slate-200 bg-slate-100/50">
                <tr>
                  <th class="py-1.5 px-2">帳戶</th>
                  <th class="py-1.5 px-2">買進日</th>
                  <th class="py-1.5 px-2 text-right">原股數</th>
                  <th class="py-1.5 px-2 text-right text-indigo-600 font-medium">新股數</th>
                  <th class="py-1.5 px-2 text-right">原均價</th>
                  <th class="py-1.5 px-2 text-right text-indigo-600 font-medium">新均價</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="h in previewData.sampleHoldings" :key="h.id">
                  <td class="py-1.5 px-2">{{ h.account || '未指定' }}</td>
                  <td class="py-1.5 px-2">{{ h.buyDate }}</td>
                  <td class="py-1.5 px-2 text-right">{{ fmtNum(h.origShares) }}</td>
                  <td class="py-1.5 px-2 text-right text-indigo-600 font-semibold">{{ fmtNum(h.afterShares) }}</td>
                  <td class="py-1.5 px-2 text-right">${{ h.origCost }}</td>
                  <td class="py-1.5 px-2 text-right text-indigo-600 font-semibold">${{ h.afterCost }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 區塊二：歷史分割紀錄與一鍵還原 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <span class="w-2 h-4 bg-indigo-600 rounded-full inline-block"></span>
          分割執行紀錄與還原
        </h2>
        <button
          type="button"
          @click="refreshHistory"
          class="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          重新載入紀錄
        </button>
      </div>

      <div v-if="splitHistory.length === 0" class="py-10 text-center text-xs text-slate-400">
        目前尚無任何分割執行紀錄。
      </div>

      <!-- 桌機版表格 -->
      <div v-else class="hidden sm:block overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="text-slate-400 border-b border-slate-200 bg-slate-50/50">
            <tr>
              <th class="py-2.5 px-3">股票</th>
              <th class="py-2.5 px-3">基準日 / 復牌日</th>
              <th class="py-2.5 px-3">分割倍數</th>
              <th class="py-2.5 px-3">影響範圍</th>
              <th class="py-2.5 px-3">執行時間</th>
              <th class="py-2.5 px-3">狀態</th>
              <th class="py-2.5 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-600">
            <tr v-for="rec in splitHistory" :key="rec.id" class="hover:bg-slate-50/60 transition-colors">
              <td class="py-3 px-3 font-medium text-slate-800">
                <span class="font-bold mr-1">{{ rec.stock_code }}</span>
                <span class="text-slate-500 font-normal">{{ rec.stock_name }}</span>
              </td>
              <td class="py-3 px-3">
                <div>{{ rec.split_date }}</div>
                <div v-if="rec.resume_date" class="text-[11px] text-slate-400">復牌: {{ rec.resume_date }}</div>
              </td>
              <td class="py-3 px-3 font-semibold text-indigo-600">1 拆 {{ rec.ratio }}</td>
              <td class="py-3 px-3 text-slate-500">
                持股 {{ rec.holdings_count }} 筆 / 日線 {{ rec.daily_prices_count }} 筆
              </td>
              <td class="py-3 px-3 text-slate-400">{{ fmtDateTime(rec.created_at) }}</td>
              <td class="py-3 px-3">
                <span
                  class="px-2 py-0.5 rounded-full text-[11px] font-medium"
                  :class="rec.status === 'applied' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'"
                >
                  {{ rec.status === 'applied' ? '已套用' : '已還原' }}
                </span>
              </td>
              <td class="py-3 px-3 text-right">
                <button
                  v-if="rec.status === 'applied'"
                  type="button"
                  @click="openRevert(rec)"
                  class="px-2.5 py-1 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
                >
                  一鍵還原
                </button>
                <span v-else class="text-xs text-slate-400">已於 {{ fmtDateTime(rec.reverted_at) }} 還原</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 手機版卡片清單 -->
      <div v-if="splitHistory.length > 0" class="sm:hidden space-y-3">
        <div
          v-for="rec in splitHistory"
          :key="rec.id"
          class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5"
        >
          <div class="flex items-center justify-between">
            <div class="font-bold text-slate-800 text-sm">
              {{ rec.stock_code }} <span class="font-normal text-slate-500 text-xs">{{ rec.stock_name }}</span>
            </div>
            <span
              class="px-2 py-0.5 rounded-full text-[10px] font-medium"
              :class="rec.status === 'applied' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'"
            >
              {{ rec.status === 'applied' ? '已套用' : '已還原' }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>
              基準日：<span class="text-slate-700">{{ rec.split_date }}</span>
              <span v-if="rec.resume_date" class="text-slate-400 block text-[10px]">復牌 {{ rec.resume_date }}</span>
            </div>
            <div>倍數：<span class="text-indigo-600 font-semibold">1 拆 {{ rec.ratio }}</span></div>
            <div class="col-span-2">
              影響筆數：持股 {{ rec.holdings_count }} 筆 / 日線 {{ rec.daily_prices_count }} 筆
            </div>
            <div class="col-span-2 text-[11px] text-slate-400">
              執行時間：{{ fmtDateTime(rec.created_at) }}
            </div>
          </div>

          <div v-if="rec.status === 'applied'" class="pt-2 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              @click="openRevert(rec)"
              class="w-full py-1.5 text-xs text-center rounded-lg border border-red-200 text-red-600 bg-red-50/50 font-medium active:scale-98 transition-all"
            >
              一鍵還原
            </button>
          </div>
          <div v-else class="pt-1 text-[11px] text-slate-400 text-right">
            已還原 ({{ fmtDateTime(rec.reverted_at) }})
          </div>
        </div>
      </div>
    </div>

    <!-- 彈窗 1：執行確認 BottomSheet -->
    <BottomSheet v-model="showConfirmModal" title="確認執行股票分割">
      <div class="space-y-4 text-xs text-slate-600">
        <p class="text-sm font-semibold text-slate-800">
          即將執行 {{ form.stockCode }}（{{ form.stockName }}）的 1 拆 {{ form.ratio }} 分割：
        </p>
        <ul class="list-disc pl-5 space-y-1.5 text-slate-600">
          <li>影響持股單據：<b>{{ previewData?.holdingsCount }}</b> 筆（基準日 {{ form.splitDate }} 含以前）</li>
          <li>總持有股數：由 <b>{{ fmtNum(previewData?.currentShares) }}</b> 變為 <b>{{ fmtNum(previewData?.newShares) }}</b> 股</li>
          <li>平均成本：由加權成本調降為約 <b>${{ previewData?.newAverageCostPreview }}</b> 元</li>
          <li>恢復交易日：<b>{{ previewData?.resumeDate ? `${previewData.resumeDate}（自動校正快照）` : '未指定（以基準日起算）' }}</b></li>
          <li>每日快照校正：<b>{{ (previewData?.snapshotsCount || 0) > 0 ? `自動校正 ${previewData?.snapshotsCount} 筆快照（從 ${previewData?.resumeDate || form.splitDate} 起）` : '無受影響快照' }}</b></li>
          <li>歷史日收盤價：<b>{{ form.adjustDailyPrices ? `同步還原 ${previewData?.dailyPricesCount} 筆收盤價` : '不更動' }}</b></li>
        </ul>
        <div class="p-3 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
          提示：執行後系統將自動校正快照，若發現數值有誤，可隨時在紀錄區點擊「一鍵還原」完全回復。
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            @click="showConfirmModal = false"
            class="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            @click="executeApply"
            :disabled="applying"
            class="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1"
          >
            <svg v-if="applying" class="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>{{ applying ? '執行中…' : '確認執行' }}</span>
          </button>
        </div>
      </template>
    </BottomSheet>

    <!-- 彈窗 2：還原確認 BottomSheet -->
    <BottomSheet v-model="showRevertModal" title="確認一鍵還原分割">
      <div v-if="targetRevertRecord" class="space-y-4 text-xs text-slate-600">
        <p class="text-sm font-semibold text-slate-800">
          確定要還原 {{ targetRevertRecord.stock_code }} 的 1 拆 {{ targetRevertRecord.ratio }} 分割嗎？
        </p>
        <div class="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
          系統將依照該次分割儲存的原始快照資料，將受影響的持股單據股數與均價回復至分割前的數值；若當初有同步分割歷史日線價格或校正每日資產快照，亦會將數值乘回與還原至原始水平。
        </div>
        <p class="text-[11px] text-slate-400">
          執行時間：{{ fmtDateTime(targetRevertRecord.created_at) }} ｜ 基準日：{{ targetRevertRecord.split_date }} <span v-if="targetRevertRecord.resume_date">｜ 復牌日：{{ targetRevertRecord.resume_date }}</span>
        </p>
      </div>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            @click="showRevertModal = false"
            class="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            @click="executeRevert"
            :disabled="reverting"
            class="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1"
          >
            <svg v-if="reverting" class="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>{{ reverting ? '還原中…' : '確認還原' }}</span>
          </button>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
