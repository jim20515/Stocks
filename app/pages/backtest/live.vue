<script setup lang="ts">
const { authHeaders } = useAuth()

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

// ── 來源資料：持股（股票建議清單）、帳戶管理的帳戶、已存群組 ──
const { data: holdings } = await useAuthFetch<any[]>('/api/stockholdings/index', { key: 'live-holdings' })
const { data: accounts } = await useAuthFetch<{ id: number; name: string }[]>('/api/accounts', { key: 'live-accounts' })
const { data: battles, refresh: refreshBattles } = await useAuthFetch<any[]>('/api/strategy-battles', { key: 'live-battles' })

// 股票建議：持股中出現過的代號（僅作為輸入提示，非限制）
const heldCodes = computed(() => {
  const map = new Map<string, string>()
  for (const h of holdings.value ?? []) map.set(h.stock_code.toUpperCase(), h.stock_name)
  return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
})
const accountNames = computed(() => (accounts.value ?? []).map(a => a.name))

// ── 篩選條件 ──
const codeInput = ref('')                 // 股票代號（必填，一次算一隻）
const filterAccount = ref('')
const startDate = ref(today)              // 起始日預設今天
const endDate = ref('')
const includeFee = ref(true)

const filterCode = computed(() => codeInput.value.trim().toUpperCase())

// 股票輸入建議下拉
const showDropdown = ref(false)
const filteredCodes = computed(() => {
  const q = filterCode.value
  if (!q) return heldCodes.value
  return heldCodes.value.filter(s => s.code.includes(q) || s.name.toUpperCase().includes(q))
})
function pickCode(code: string) {
  const s = heldCodes.value.find(s => s.code === code)
  codeInput.value = s ? `${s.code}　${s.name}` : code
  showDropdown.value = false
}
function onCodeBlur() { setTimeout(() => { showDropdown.value = false }, 150) }
// 送出時把「代號　名稱」還原成純代號
function pureCode() {
  return codeInput.value.trim().split(/[\s　]/)[0].toUpperCase()
}

// ── 計算結果 ──
type Pair = { code: string; name: string; buyDate: string | null; buyPrice: number | null; sellDate: string; sellPrice: number; shares: number; profit: number | null; orphan: boolean; sharesAfter: number }
type OpenLot = { code: string; name: string; buyDate: string; buyPrice: number; shares: number; currentPrice: number | null; unrealizedProfit: number | null; sharesAfter: number }
type Result = {
  pairs: Pair[]; openLots: OpenLot[]; totalCost: number; realizedProfit: number; unrealizedProfit: number
  totalProfit: number; returnPct: number | null; buyCount: number; sellCount: number; pairCount: number
  winCount: number; remainingShares: number; matchedCount: number; priceDate: string | null
}
const result = ref<Result | null>(null)
const loading = ref(false)
const error = ref('')

async function runResult() {
  const c = pureCode()
  if (!c) { error.value = '請先輸入股票代號'; result.value = null; return }
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const data = await $fetch<Result>('/api/strategy-battles/result', {
      headers: authHeaders.value as HeadersInit,
      query: {
        code: c,
        account: filterAccount.value || undefined,
        startDate: startDate.value || undefined,
        endDate: endDate.value || undefined,
        includeFee: includeFee.value ? 'true' : 'false',
      },
    })
    result.value = data
  } catch (e: any) {
    error.value = e?.data?.message ?? '試算失敗'
  } finally {
    loading.value = false
  }
}

// ── 存成 / 載入 / 刪除 群組 ──
const battleName = ref('')
const saving = ref(false)

async function saveBattle() {
  if (!battleName.value.trim()) { error.value = '請輸入群組名稱'; return }
  if (!pureCode()) { error.value = '請先輸入股票代號'; return }
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/strategy-battles', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: {
        name: battleName.value.trim(),
        filterCode: pureCode(),
        filterAccount: filterAccount.value || null,
        filterStartDate: startDate.value || null,
        filterEndDate: endDate.value || null,
        includeFee: includeFee.value,
      },
    })
    battleName.value = ''
    await refreshBattles()
  } catch (e: any) {
    error.value = e?.data?.message ?? '儲存失敗'
  } finally {
    saving.value = false
  }
}

async function loadBattle(b: any) {
  const s = heldCodes.value.find(s => s.code === b.filter_code)
  codeInput.value = b.filter_code ? (s ? `${s.code}　${s.name}` : b.filter_code) : ''
  filterAccount.value = b.filter_account ?? ''
  startDate.value = b.filter_start_date ?? ''
  endDate.value = b.filter_end_date ?? ''
  includeFee.value = b.include_fee !== false
  await runResult()
}

async function deleteBattle(id: number) {
  if (!confirm('確定刪除此實戰群組？')) return
  try {
    await $fetch(`/api/strategy-battles/${id}`, { method: 'DELETE', headers: authHeaders.value as HeadersInit })
    await refreshBattles()
  } catch (e: any) {
    error.value = e?.data?.message ?? '刪除失敗'
  }
}

function ruleSummary(b: any) {
  const parts: string[] = []
  if (b.filter_code) parts.push(b.filter_code)
  if (b.filter_account) parts.push(`帳戶：${b.filter_account}`)
  if (b.filter_start_date || b.filter_end_date) parts.push(`${b.filter_start_date ?? '—'}~${b.filter_end_date ?? '今'}`)
  return parts.join('・') || '—'
}

// ── 格式化 ──
function money(v: number) { return Math.round(v).toLocaleString('zh-TW') }
function pct(v: number | null) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }
function pctClass(v: number) { return v > 0 ? 'text-red-500' : v < 0 ? 'text-green-600' : 'text-slate-400' }
function shareStr(shares: number) { return shares.toLocaleString('zh-TW') }

// 合併「買賣配對」與「持有中批次」成同一張明細表：每列都對應到買入＋賣出
type Row = {
  code: string; name: string; buyDate: string | null; buyPrice: number | null
  sellDate: string | null; sellPrice: number | null; shares: number
  profit: number | null; sharesAfter: number; held: boolean; orphan: boolean
}
const detailRows = computed<Row[]>(() => {
  if (!result.value) return []
  const realized: Row[] = result.value.pairs.map(p => ({
    code: p.code, name: p.name, buyDate: p.buyDate, buyPrice: p.buyPrice,
    sellDate: p.sellDate, sellPrice: p.sellPrice, shares: p.shares, profit: p.profit,
    sharesAfter: p.sharesAfter, held: false, orphan: p.orphan,
  }))
  const open: Row[] = result.value.openLots.map(l => ({
    code: l.code, name: l.name, buyDate: l.buyDate, buyPrice: l.buyPrice,
    sellDate: null, sellPrice: l.currentPrice, shares: l.shares, profit: l.unrealizedProfit ?? 0,
    sharesAfter: l.sharesAfter, held: true, orphan: false,
  }))
  // 排序 key：持有中用買入日期，其餘用賣出日期（＝該列的關鍵事件）
  const key = (r: Row) => (r.held ? r.buyDate : r.sellDate) ?? ''
  return [...realized, ...open].sort((a, b) => key(a).localeCompare(key(b)) || a.code.localeCompare(b.code))
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="text-lg font-bold text-slate-800">策略實戰</h2>
      <p class="text-xs text-slate-400 mt-0.5">從持股管理挑出真實交易，用先進後出（LIFO）逐批配對計算實際損益。可先建立群組，之後符合的交易會自動納入</p>
    </div>

    <!-- 設定卡片 -->
    <div class="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 股票代號（必填、一次一隻、可自由輸入）-->
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號<span class="text-red-400 ml-1">必填</span></label>
          <div class="relative">
            <input
              v-model="codeInput"
              type="text"
              placeholder="輸入代號，例如 0050（可尚未持有）"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              @focus="showDropdown = true"
              @blur="onCodeBlur"
              @keyup.enter="runResult"
            />
            <div v-if="showDropdown && filteredCodes.length"
              class="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <button v-for="s in filteredCodes" :key="s.code" type="button"
                class="w-full flex items-center justify-between px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50"
                @mousedown.prevent="pickCode(s.code)">
                <span><span class="font-mono font-medium">{{ s.code }}</span><span class="ml-2 text-slate-500">{{ s.name }}</span></span>
                <span class="text-xs text-slate-300">持股中</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 帳戶（選填，來自帳戶管理）-->
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">帳戶<span class="text-slate-300 ml-1">選填</span></label>
          <select v-model="filterAccount"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
            <option value="">全部帳戶</option>
            <option v-for="a in accountNames" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>

        <!-- 起始日（預設今天，選填）-->
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">起始日期<span class="text-slate-300 ml-1">選填</span></label>
          <input v-model="startDate" type="date"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <!-- 結束日（選填）-->
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">結束日期<span class="text-slate-300 ml-1">選填</span></label>
          <input v-model="endDate" type="date"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="includeFee" class="accent-indigo-600 w-4 h-4" />
          <span class="text-sm text-slate-600">扣手續費與證交稅</span>
        </label>
        <button @click="runResult" :disabled="loading || !pureCode()"
          class="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2">
          <svg :class="loading ? 'animate-spin' : ''" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7V5z" />
          </svg>
          {{ loading ? '計算中…' : '試算' }}
        </button>

        <div class="flex items-center gap-2">
          <input v-model="battleName" type="text" placeholder="群組名稱，例如：0050網格"
            class="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44" />
          <button @click="saveBattle" :disabled="saving || !battleName.trim() || !pureCode()"
            class="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition">
            存成實戰群組
          </button>
        </div>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
      </div>
      <p class="text-xs text-slate-400">一次分析一隻股票，用先進後出（LIFO）配對。帳戶與日期可選填縮小範圍；若賣出的對應買入落在起始日之前（被切掉），該筆賣出仍會列出、但庫存維持 0、不計損益（僅呈現）。存成群組後，之後在持股管理新增的同代號交易會自動納入。</p>
    </div>

    <!-- 已存實戰群組 -->
    <div v-if="battles?.length" class="bg-white rounded-xl border border-slate-200 p-5">
      <p class="text-sm font-semibold text-slate-700 mb-3">我的實戰群組</p>
      <div class="space-y-2">
        <div v-for="b in battles" :key="b.id"
          class="flex items-center gap-3 px-4 py-3 border border-slate-100 rounded-lg hover:bg-slate-50/60 transition">
          <button @click="loadBattle(b)" class="flex-1 text-left">
            <span class="text-sm font-medium text-slate-700">{{ b.name }}</span>
            <span class="block text-xs text-slate-400 mt-0.5">{{ ruleSummary(b) }}</span>
          </button>
          <button @click="loadBattle(b)" class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">重新計算</button>
          <button @click="deleteBattle(b.id)" class="text-slate-300 hover:text-red-400 transition" title="刪除">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 結果 -->
    <template v-if="result">
      <div v-if="result.matchedCount === 0"
        class="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 text-sm text-orange-700">
        此股票（{{ filterAccount || '全部帳戶' }}）目前沒有任何交易紀錄。可先存成群組，之後在持股管理新增同代號交易會自動納入。
      </div>

      <template v-else>
        <!-- 統計卡 -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">投入成本</p>
            <p class="text-lg font-bold text-slate-800">{{ money(result.totalCost) }}</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">已實現損益</p>
            <p class="text-lg font-bold" :class="pctClass(result.realizedProfit)">{{ result.realizedProfit >= 0 ? '+' : '' }}{{ money(result.realizedProfit) }}</p>
            <p class="text-xs text-slate-400 mt-0.5">勝率 {{ result.pairCount > 0 ? Math.round(result.winCount / result.pairCount * 100) : 0 }}%（{{ result.winCount }}/{{ result.pairCount }} 配對）</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">未實現損益</p>
            <p class="text-lg font-bold" :class="pctClass(result.unrealizedProfit)">{{ result.unrealizedProfit >= 0 ? '+' : '' }}{{ money(result.unrealizedProfit) }}</p>
            <p class="text-xs text-slate-400 mt-0.5">剩餘 {{ shareStr(result.remainingShares) }} 股</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">總損益</p>
            <p class="text-lg font-bold" :class="pctClass(result.totalProfit)">{{ result.totalProfit >= 0 ? '+' : '' }}{{ money(result.totalProfit) }}</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">報酬率</p>
            <p class="text-lg font-bold" :class="result.returnPct != null ? pctClass(result.returnPct) : 'text-slate-400'">{{ pct(result.returnPct) }}</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="text-xs text-slate-400 mb-1">交易筆數</p>
            <p class="text-lg font-bold text-slate-700">{{ result.matchedCount }}</p>
            <p class="text-xs text-slate-400 mt-0.5">買 {{ result.buyCount }}・賣 {{ result.sellCount }}</p>
          </div>
        </div>

        <!-- 交易明細（每列對應買入＋賣出，最右為該筆之後的剩餘股數）-->
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p class="text-sm font-semibold text-slate-700">交易明細（買入 → 賣出配對，未賣出者列為持有中）</p>
            <p class="text-xs text-slate-400">共 {{ detailRows.length }} 筆<span v-if="result.priceDate"> · 價格 {{ result.priceDate }}</span></p>
          </div>
          <div v-if="detailRows.length === 0" class="py-10 text-center text-sm text-slate-400">此條件下無交易</div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-100">
                  <th class="text-left px-4 py-2.5 text-xs font-medium text-slate-500">股票</th>
                  <th class="text-left px-4 py-2.5 text-xs font-medium text-slate-500">買入日期</th>
                  <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">買入價</th>
                  <th class="text-left px-4 py-2.5 text-xs font-medium text-slate-500">賣出日期</th>
                  <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">賣出/現價</th>
                  <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">股數</th>
                  <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">損益</th>
                  <th class="text-right px-4 py-2.5 text-xs font-medium text-slate-500">剩餘股數</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="(r, i) in detailRows" :key="i" class="hover:bg-slate-50/50 transition" :class="r.orphan ? 'bg-slate-50/40' : ''">
                  <td class="px-4 py-2.5 text-slate-700"><span class="font-mono font-medium">{{ r.code }}</span> <span class="text-slate-400 text-xs">{{ r.name }}</span></td>
                  <td class="px-4 py-2.5">
                    <span v-if="r.orphan" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">買入已切掉</span>
                    <span v-else class="text-slate-600">{{ r.buyDate }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono text-indigo-600">{{ r.buyPrice != null ? r.buyPrice.toLocaleString('zh-TW') : '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span v-if="r.held" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600">持有中</span>
                    <span v-else class="text-slate-600">{{ r.sellDate }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono" :class="r.held ? 'text-slate-400' : 'text-red-500'">
                    {{ r.sellPrice != null ? r.sellPrice.toLocaleString('zh-TW') : '—' }}
                  </td>
                  <td class="px-4 py-2.5 text-right text-slate-600">{{ shareStr(r.shares) }}</td>
                  <td class="px-4 py-2.5 text-right font-medium" :class="r.profit != null ? pctClass(r.profit) : 'text-slate-300'">
                    <template v-if="r.profit != null">{{ r.profit >= 0 ? '+' : '' }}{{ money(r.profit) }}</template>
                    <template v-else>—</template>
                    <span v-if="r.held" class="text-xs text-slate-300 ml-0.5">未實現</span>
                    <span v-else-if="r.orphan" class="text-xs text-slate-300 ml-0.5">僅呈現</span>
                  </td>
                  <td class="px-4 py-2.5 text-right font-medium text-slate-700">{{ shareStr(r.sharesAfter) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
