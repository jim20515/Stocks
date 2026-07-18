<script setup lang="ts">
const { authHeaders } = useAuth()
const { isGuest, promptLogin } = useGuestGate()
const { data: projection, refresh: refreshProjection } = await useAppData<any>('/api/portfolio/life-projection', { key: 'life-projection' }, DEMO_PROJECTION)
const { data: settings } = await useAppData<any>('/api/portfolio/settings', { key: 'life-settings' }, DEMO_SETTINGS)

const form = ref<Record<string, any>>({})
const saving = ref(false)
const msg = ref('')

watch(settings, (s) => {
  if (!s) return
  form.value = {
    startInvestYear: s.start_invest_year,
    initialAge: s.initial_age,
    initialAmount: s.initial_amount,
    annualContribution: s.annual_contribution,
    stopContributionYear: s.stop_contribution_year,
    expectedAnnualReturn: (Number(s.expected_annual_return) * 100).toFixed(1),
    cashAmount: s.cash_amount,
    targetBeta: s.target_beta,
  }
}, { immediate: true })

const errorMsg = ref('')

// 依表單即時試算資產成長（與後端 life-projection 同一套公式），訪客用它看結果
function computeProjection(f: Record<string, any>) {
  const startInvestYear = Number(f.startInvestYear)
  const initialAge = Number(f.initialAge)
  const initialAmount = Number(String(f.initialAmount).replace(/,/g, ''))
  const contrib = Number(String(f.annualContribution).replace(/,/g, ''))
  const stopYear = Number(f.stopContributionYear)
  const rate = Number(f.expectedAnnualReturn) / 100
  const endYear = startInvestYear + (90 - initialAge)
  const rows: any[] = []
  let assets = initialAmount
  let totalContrib = 0
  for (let year = startInvestYear; year <= endYear; year++) {
    const age = initialAge + (year - startInvestYear)
    const interest = Math.round(assets - initialAmount - totalContrib)
    rows.push({ year, age, assets: Math.round(assets), starting: initialAmount, contributions: Math.round(totalContrib), interest: Math.max(0, interest) })
    const contribution = year < stopYear ? contrib : 0
    totalContrib += contribution
    assets = (assets + contribution) * (1 + rate)
  }
  return {
    currentYear: new Date().getFullYear(),
    startInvestYear, initialAge,
    settings: { startInvestYear, initialAge, initialAmount, annualContribution: contrib, stopContributionYear: stopYear, expectedAnnualReturn: rate },
    rows,
  }
}

// 訪客：按鈕改為即時試算（不儲存）；會員：儲存到帳號
function applyGuest() {
  projection.value = computeProjection(form.value)
  msg.value = '已試算（登入後可儲存）'
  setTimeout(() => msg.value = '', 2500)
}

async function save() {
  if (isGuest.value) return promptLogin()
  saving.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/portfolio/settings', {
      method: 'PUT',
      headers: authHeaders.value as HeadersInit,
      body: {
        startInvestYear: Number(form.value.startInvestYear),
        initialAge: Number(form.value.initialAge),
        initialAmount: Number(String(form.value.initialAmount).replace(/,/g, '')),
        annualContribution: Number(String(form.value.annualContribution).replace(/,/g, '')),
        stopContributionYear: Number(form.value.stopContributionYear),
        expectedAnnualReturn: Number(form.value.expectedAnnualReturn) / 100,
        cashAmount: Number(String(form.value.cashAmount).replace(/,/g, '')),
        targetBeta: Number(form.value.targetBeta),
      },
    })
    await refreshProjection()
    msg.value = '設定已儲存'
    setTimeout(() => msg.value = '', 2000)
  } catch (e: any) {
    console.error('[lifegoal save] failed:', e)
    errorMsg.value = e?.data?.message || e?.message || '儲存失敗，請稍後再試'
  } finally {
    saving.value = false
  }
}

function money(v: any) {
  const n = Number(v)
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 億'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 萬'
  return n.toLocaleString()
}

function fullMoney(v: any) { return Number(v).toLocaleString('zh-TW') }

function onMoneyFocus(e: any) { e.target.value = e.target.value.replace(/,/g, '') }
function onMoneyBlur(e: any, key: string) {
  const n = Number(e.target.value.replace(/,/g, ''))
  if (!isNaN(n)) {
    form.value[key] = n
    e.target.value = n.toLocaleString('zh-TW')
  }
}

const milestones = computed(() => {
  if (!projection.value) return []
  return [1e7, 5e7, 1e8, 5e8, 1e9, 1e10].map(target => {
    const row = projection.value.rows.find((r: any) => r.assets >= target)
    return row ? { target, year: row.year, age: row.age } : null
  }).filter(Boolean) as any[]
})
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="text-sm font-semibold text-slate-800 mb-4">投資參數設定</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">開始投資年（西元）</label>
          <input v-model="form.startInvestYear" type="number"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">初始年齡</label>
          <input v-model="form.initialAge" type="number"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">初始資金（元）</label>
          <input :value="form.initialAmount != null ? Number(form.initialAmount).toLocaleString('zh-TW') : ''"
            type="text" inputmode="numeric"
            @focus="onMoneyFocus" @blur="(e) => onMoneyBlur(e, 'initialAmount')"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">每年投入（元）</label>
          <input :value="form.annualContribution != null ? Number(form.annualContribution).toLocaleString('zh-TW') : ''"
            type="text" inputmode="numeric"
            @focus="onMoneyFocus" @blur="(e) => onMoneyBlur(e, 'annualContribution')"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">停止投入年度</label>
          <input v-model="form.stopContributionYear" type="number"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1.5">期望年報酬（%）</label>
          <input v-model="form.expectedAnnualReturn" type="number" step="0.1"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>
      <div class="flex items-center gap-3 mt-4">
        <button @click="isGuest ? applyGuest() : save()" :disabled="saving"
          class="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
          {{ saving ? '儲存中…' : isGuest ? '試算' : '套用設定' }}
        </button>
        <span v-if="isGuest" class="text-xs text-slate-400">登入後可將這組設定存進帳號</span>
        <span v-if="msg" class="text-sm text-green-600 font-medium">✓ {{ msg }}</span>
        <span v-if="errorMsg" class="text-sm text-red-500 font-medium">✕ {{ errorMsg }}</span>
      </div>
    </div>

    <div v-if="projection">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <div v-for="m in milestones" :key="m.target"
          class="bg-white rounded-xl p-4 border border-slate-200 text-center">
          <p class="text-xs text-slate-400 mb-1">達到 {{ money(m.target) }}</p>
          <p class="text-xl font-bold text-indigo-600">{{ m.age }} 歲</p>
          <p class="text-xs text-slate-400">{{ m.year }} 年</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 class="text-sm font-semibold text-slate-800">資產成長試算</h3>
          <p class="text-xs text-slate-400">
            起始 {{ projection.settings.startInvestYear }} 年・{{ projection.settings.initialAge }} 歲・NT$ {{ fullMoney(projection.settings.initialAmount) }}・年化 {{ (projection.settings.expectedAnnualReturn * 100).toFixed(1) }}%
          </p>
        </div>
        <div class="overflow-auto max-h-[520px]">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 z-10">
              <tr class="border-b border-slate-100">
                <th class="text-left px-5 py-3 text-xs font-medium text-slate-500">年份</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-slate-500">年齡</th>
                <th class="text-right px-5 py-3 text-xs font-medium text-slate-500">預估總資產</th>
                <th class="px-5 py-3 w-56">
                  <div class="flex items-center gap-3 text-xs text-slate-400 font-normal">
                    <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400"></span>起始</span>
                    <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-400"></span>投入</span>
                    <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-red-400"></span>獲利</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              <tr v-for="row in projection.rows" :key="row.year"
                class="hover:bg-slate-50/50 transition"
                :class="row.year === projection.currentYear ? 'bg-indigo-50' : ''">
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-800">{{ row.year }}</span>
                    <span v-if="row.year === projection.currentYear"
                      class="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">今年</span>
                    <span v-if="row.year === projection.settings.stopContributionYear"
                      class="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">停投</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right text-slate-600">{{ row.age }} 歲</td>
                <td class="px-5 py-3 text-right">
                  <span class="font-bold text-slate-800">NT$ {{ fullMoney(row.assets) }}</span>
                  <span class="ml-2 text-xs text-slate-400">{{ money(row.assets) }}</span>
                </td>
                <td class="px-5 py-3">
                  <div class="h-3 rounded-full overflow-hidden flex">
                    <div class="h-full bg-blue-400 transition-all duration-500"
                      :style="{ width: (row.starting / row.assets * 100) + '%' }"></div>
                    <div class="h-full bg-green-400 transition-all duration-500"
                      :style="{ width: (row.contributions / row.assets * 100) + '%' }"></div>
                    <div class="h-full bg-red-400 transition-all duration-500"
                      :style="{ width: (row.interest / row.assets * 100) + '%' }"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
