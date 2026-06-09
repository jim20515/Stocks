<script setup lang="ts">
const route = useRoute()
const { user, clearSession, authHeaders } = useAuth()
const { $authFetch } = useNuxtApp()

const showModal = ref(false)
const editingId = ref<number | null>(null)
const lookingUp = ref(false)
const lookupError = ref('')

const form = ref({ stockCode: '', stockName: '', shares: '', averageCost: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '' })

const refreshKey = useState('portfolioRefreshKey', () => 0)

provide('refreshKey', refreshKey)
provide('openEditModal', (holding: any) => {
  editingId.value = holding.id
  form.value = {
    stockCode: holding.stockCode,
    stockName: holding.stockName,
    shares: holding.shares,
    averageCost: holding.averageCost,
    buyDate: holding.buyDate,
    leverageMultiplier: holding.leverageMultiplier ?? 1,
    watermarkPrice: holding.watermarkPrice ?? '',
  }
  lookupError.value = ''
  showModal.value = true
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function openModal() {
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
  form.value = { stockCode: '', stockName: '', shares: '', averageCost: '', buyDate: today(), leverageMultiplier: 1, watermarkPrice: '' }
  lookupError.value = ''
}

async function logout() {
  clearSession()
  await navigateTo('/login')
}

async function onCodeBlur() {
  const code = form.value.stockCode.trim()
  if (!code) return
  lookupError.value = ''
  lookingUp.value = true
  try {
    const data = await ($authFetch as any)<any>(`/api/stockholdings/lookup/${code}`)
    form.value.stockName = data.name
    if (data.price) form.value.averageCost = data.price
  } catch {
    lookupError.value = '查無此代號'
  } finally {
    lookingUp.value = false
  }
}

async function submitForm() {
  if (!form.value.stockCode || !form.value.shares || !form.value.averageCost) return
  const payload = {
    stockCode: form.value.stockCode.trim(),
    stockName: form.value.stockName.trim() || form.value.stockCode.trim(),
    shares: Number(form.value.shares),
    averageCost: Number(form.value.averageCost),
    buyDate: form.value.buyDate,
    leverageMultiplier: Number(form.value.leverageMultiplier),
    watermarkPrice: form.value.watermarkPrice ? Number(form.value.watermarkPrice) : null,
  }
  if (editingId.value) {
    await ($authFetch as any)(`/api/stockholdings/${editingId.value}`, { method: 'PUT', body: payload })
  } else {
    await ($authFetch as any)('/api/stockholdings', { method: 'POST', body: payload })
  }
  refreshKey.value++
  closeModal()
}

</script>

<template>
  <div class="min-h-screen bg-slate-50 flex">
    <LayoutSidebar />
    <div class="ml-60 flex-1 flex flex-col min-h-screen">
      <LayoutAppHeader @add="openModal" @logout="logout" />
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>

    <!-- 新增 / 編輯持股 Modal -->
    <Transition name="fade">
      <div v-if="showModal"
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        @click.self="closeModal">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-xl">
          <div class="flex items-center justify-between p-6 border-b border-slate-100">
            <h2 class="text-base font-semibold text-slate-800">{{ editingId ? '編輯持股' : '新增持股' }}</h2>
            <button @click="closeModal" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 持股表單 -->
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">股票代號</label>
              <input v-model="form.stockCode" type="text" placeholder="例：2330"
                @blur="onCodeBlur" @input="lookupError = ''"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">
                股票名稱
                <span v-if="lookingUp" class="ml-2 text-slate-400 font-normal">查詢中…</span>
                <span v-else-if="lookupError" class="ml-2 text-red-500 font-normal">{{ lookupError }}</span>
              </label>
              <input v-model="form.stockName" type="text" placeholder="輸入代號後自動帶入"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1.5">持有股數</label>
                <input v-model="form.shares" type="number" min="1" placeholder="例：1000（1張）"
                  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1.5">
                  平均成本（每股）
                  <span v-if="form.averageCost && !editingId" class="ml-1 font-normal text-indigo-400">← 已帶入現價</span>
                </label>
                <input
                  :value="form.averageCost !== '' ? Number(form.averageCost).toLocaleString('zh-TW') : ''"
                  type="text" inputmode="decimal" placeholder="輸入代號後自動帶入現價"
                  @focus="(e: any) => { e.target.value = String(form.averageCost).replace(/,/g, '') }"
                  @blur="(e: any) => { const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) form.averageCost = String(n) }"
                  @input="(e: any) => { form.averageCost = e.target.value.replace(/,/g, '') }"
                  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">持股類型</label>
              <select v-model="form.leverageMultiplier"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option :value="1">1x 一般（Beta 貢獻 ×1）</option>
                <option :value="2">2x 槓桿（Beta 貢獻 ×2）</option>
                <option :value="0">類現金（Beta 貢獻 0）</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1.5">買入日期</label>
              <input v-model="form.buyDate" type="date"
                class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          <div class="flex gap-3 px-6 pb-6">
            <button @click="closeModal"
              class="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              取消
            </button>
            <button @click="submitForm()"
              class="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
              {{ editingId ? '儲存變更' : '新增持股' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
