---
name: build-ui
description: 依「股票看板」專案既有風格建立前端 UI（Nuxt 4 + Vue 3 + Tailwind，無 UI library）。當使用者要新增／修改頁面、表格、彈跳視窗、表單、清單，或提到「可排序表格」「分頁」「新增/編輯/刪除視窗」「錯誤提示視窗」「loading 進度條」等 UI 元件時使用。使用者說「做一個功能／加一個功能」而該功能需要畫面時也適用（UI 部分用本 skill，後端另外做；若不確定是否需要畫面，先詢問）。確保新畫面與現有頁面（stocks.vue、default.vue）風格一致。
---

# 股票看板 UI 風格 Skill

依本專案既有慣例產出前端 UI，讓新畫面與 `stocks.vue`、`layouts/default.vue` 完全一致。**不要引入任何 UI library**（無 shadcn / MUI / Element），一律用 Tailwind primitive 手刻。

## 技術棧鐵則

- **Nuxt 4 + Vue 3 `<script setup lang="ts">`**（TypeScript strict）。
- **只用 Tailwind utility class**，不寫 CSS 檔、不用 CSS modules。
- 元件放 `app/components/`，可複用邏輯放 `app/composables/`（`useXxx`），頁面放 `app/pages/`（Nuxt 自動路由）。
- **程式識別字用英文，UI 文字用繁中**。
- **顏色慣例（台股）**：漲/獲利 = `text-red-500`；跌/虧損 = `text-green-600`；持平 = `text-slate-400`；主要操作/強調 = `indigo`（`indigo-500` / `indigo-600` / `focus:ring-indigo-300`）。
- **圓角**：卡片/視窗 `rounded-2xl`，按鈕/輸入框 `rounded-lg`，badge `rounded-full`。
- 中性色一律用 `slate` 系（`slate-800` 標題、`slate-500` 次要、`slate-200` 邊框、`slate-100` 分隔線）。

## API 呼叫

- 讀取資料用 `useAuthFetch('/api/...')`（自動帶 Bearer token、401 自動導回登入）：
  ```ts
  const { data: summary, refresh } = await useAuthFetch('/api/stockholdings/summary')
  ```
- 單次寫入（POST/PUT/DELETE）用全域 `$authFetch`，完成後呼叫對應的 `refresh()`：
  ```ts
  await ($authFetch as any)('/api/stockholdings', { method: 'POST', body: payload })
  await refresh()
  ```

---

## 1. 可排序 + 可分頁表格

sorting / pagination 一律用 Vue computed 手刻，**不要引入 TanStack Table 等套件**。每頁固定 `pageSize = 10`，排序切換後回到第 1 頁。

### `<script setup>`

```ts
const sortKey = ref<string>('buyDate')
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
  currentPage.value = 1
}

const sortedItems = computed(() => {
  const base = filteredItems.value            // filteredItems 為搜尋/篩選後的來源
  if (!sortKey.value) return base
  return [...base].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'zh-TW') : av - bv
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

const pageSize = 10
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / pageSize)))
const items = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedItems.value.slice(start, start + pageSize)
})
function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}
```

### `<template>` — 可排序表頭

```vue
<th class="text-left px-5 py-3 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-indigo-600"
    @click="toggleSort('stockCode')">
  代號 / 名稱
  <span class="ml-1 opacity-50">{{ sortKey === 'stockCode' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
</th>
```

表格外層用白卡片：`bg-white rounded-2xl shadow-sm`，`<thead>` 底線 `border-b border-slate-100`，資料列 `hover:bg-slate-50`，數字欄位靠右 `text-right tabular-nums`。

### 分頁控制列

```vue
<div class="flex items-center justify-between px-5 py-3 text-sm text-slate-500">
  <span>共 {{ sortedItems.length }} 筆</span>
  <div class="flex items-center gap-1">
    <button @click="goPage(currentPage - 1)" :disabled="currentPage === 1"
      class="px-2.5 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40">上一頁</button>
    <span class="px-2">{{ currentPage }} / {{ totalPages }}</span>
    <button @click="goPage(currentPage + 1)" :disabled="currentPage === totalPages"
      class="px-2.5 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40">下一頁</button>
  </div>
</div>
```

---

## 2. 新增 / 編輯 彈跳視窗（Modal）

`v-if` 開關 → `<Transition name="fade">` → 全屏 `bg-black/40` 遮罩 → 白卡片。點遮罩空白處（`@click.self`）關閉。**新增與編輯共用同一個 modal**，用 `editingId` 區分標題與行為。

```vue
<script setup lang="ts">
const showModal = ref(false)
const editingId = ref<number | null>(null)
const form = ref({ stockCode: '', stockName: '', shares: '', averageCost: '' })

function openAdd() {
  editingId.value = null
  form.value = { stockCode: '', stockName: '', shares: '', averageCost: '' }
  showModal.value = true
}
function openEdit(row: any) {
  editingId.value = row.id
  form.value = { stockCode: row.stockCode, stockName: row.stockName, shares: String(row.shares), averageCost: String(row.averageCost) }
  showModal.value = true
}
function closeModal() {
  showModal.value = false
  editingId.value = null
}
async function submit() {
  const payload = { ...form.value, shares: Number(form.value.shares), averageCost: Number(form.value.averageCost) }
  if (editingId.value) await ($authFetch as any)(`/api/stockholdings/${editingId.value}`, { method: 'PUT', body: payload })
  else await ($authFetch as any)('/api/stockholdings', { method: 'POST', body: payload })
  closeModal()
  await refresh()
}
</script>

<template>
  <Transition name="fade">
    <div v-if="showModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="closeModal">
      <div class="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div class="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 class="text-base font-semibold text-slate-800">{{ editingId ? '編輯交易' : '新增交易' }}</h2>
          <button @click="closeModal" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <!-- 表單欄位，見第 5 節輸入框樣式 -->
        </div>
        <div class="flex justify-end gap-2 p-6 border-t border-slate-100">
          <button @click="closeModal" class="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">取消</button>
          <button @click="submit" class="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700">儲存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
```

fade transition（若該頁尚未定義，加到 `<style scoped>` 或全域）：
```css
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
```

> 若 modal 是由 layout 統一管理、需跨頁開啟，沿用 `default.vue` 的 `provide('openEditModal', ...)` 模式。

---

## 3. 刪除

破壞性操作用原生 `confirm()`（本專案既有慣例），刪除後 `refresh()`：

```ts
async function remove(id: number, name: string) {
  if (!confirm(`確定刪除「${name}」？`)) return
  await ($authFetch as any)(`/api/stockholdings/${id}`, { method: 'DELETE' })
  await refresh()
}
```

> 若使用者明確要求刪除也用彈跳視窗，就複製第 2 節的 modal 外框，做一個紅色確認鈕（`bg-red-500 hover:bg-red-600 text-white`）的確認視窗。

---

## 4. 錯誤提示彈跳視窗

錯誤用 `Teleport to="body"` 的置中小視窗，紅色圓形 icon + 標題 + 訊息 + 單一「我知道了」鈕。用一個 `ref<string>` 存訊息，非空即顯示。

```vue
<script setup lang="ts">
const errorMsg = ref('')

function getErrorMessage(error: any) {
  const message = error?.data?.message ?? error?.message ?? String(error ?? '')
  if (!message || message === '[object Object]') return '操作失敗，請稍後再試'
  return message
}
// 用法：try { ... } catch (e) { errorMsg.value = getErrorMessage(e) }
</script>

<template>
  <Teleport to="body">
    <div v-if="errorMsg" class="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" @click.self="errorMsg = ''">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="text-base font-semibold text-slate-800 mb-1">發生錯誤</h2>
        <p class="text-sm text-slate-500 mb-4 leading-6">{{ errorMsg }}</p>
        <button @click="errorMsg = ''" class="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">我知道了</button>
      </div>
    </div>
  </Teleport>
</template>
```

`z-index` 層級慣例：一般 modal `z-50`、錯誤視窗 `z-[70]`、tooltip / loading bar `z-[9999]`。

---

## 5. Loading / 等待狀態

**三種既有做法，依情境選用：**

**(a) 頁面頂端進度條** — 已有全域元件 `app/components/LoadingBar.vue`，用 Nuxt `useLoadingIndicator()` 驅動，路由/`useFetch` 切換時自動出現，通常不需重寫：
```vue
<div v-if="isLoading" class="fixed top-0 left-0 z-[9999] h-0.5 bg-indigo-500 transition-all duration-300 ease-out"
  :style="{ width: progress + '%' }" />
```

**(b) 按鈕載入中** — 送出時 disable 並轉 icon：
```vue
<button @click="submit" :disabled="submitting"
  class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 transition">
  <svg v-if="submitting" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 12a9 9 0 11-6.219-8.56" stroke-linecap="round"/>
  </svg>
  {{ submitting ? '處理中…' : '儲存' }}
</button>
```

**(c) 區塊/清單載入中** — spinner 或 `animate-pulse`：
```vue
<span class="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block"></span>
<div v-if="loading" class="text-xs text-slate-400 animate-pulse">載入中…</div>
```

---

## 6. 表單輸入框樣式

標準輸入框：
```vue
<input type="text" placeholder="例：2330"
  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
```

**金額欄位一律千分位**（見專案 memory）：`type="text" inputmode="numeric"`，focus 時顯示純數字、blur 時 `toLocaleString('zh-TW')`：
```vue
<input :value="form.cash !== '' ? Number(form.cash).toLocaleString('zh-TW') : ''"
  type="text" inputmode="numeric" placeholder="例：3,500,000"
  @focus="(e: any) => { e.target.value = String(form.cash) }"
  @blur="(e: any) => { const n = Number(e.target.value.replace(/,/g,'')); if (!isNaN(n)) { form.cash = String(n); e.target.value = n.toLocaleString('zh-TW') } }"
  class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-300" />
```

---

## 7. 常用小元件

**Badge：**
```vue
<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">標籤</span>
```

**漲跌數字（台股紅漲綠跌）：**
```vue
<span :class="profit > 0 ? 'text-red-500' : profit < 0 ? 'text-green-600' : 'text-slate-400'">
  {{ profit > 0 ? '+' : '' }}{{ money(profit) }}
</span>
```

---

## 產出前檢查清單

- [ ] `<script setup lang="ts">`、只用 Tailwind、無 UI library。
- [ ] 表格：computed 排序 + 分頁，表頭可點、有 `↑↓↕` 指示，切排序回第 1 頁。
- [ ] 新增/編輯：共用 modal + `editingId`，Transition + `bg-black/40` + `@click.self` 關閉。
- [ ] 刪除：`confirm()`（或依要求做紅色確認 modal），完成後 `refresh()`。
- [ ] 錯誤：`Teleport` 置中視窗 + `getErrorMessage()`。
- [ ] Loading：頂端進度條沿用 `LoadingBar.vue`，送出按鈕 disable + spinner。
- [ ] 金額欄位千分位、漲跌用紅綠、圓角/slate/indigo 一致。
- [ ] 讀資料 `useAuthFetch`、寫資料 `$authFetch` 後 `refresh()`。
