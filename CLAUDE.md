# 股票看板 專案指引

台股個人投資組合管理系統。以下為每次都要遵守的核心慣例；詳細作法見對應 skill。

## 技術棧

- **Nuxt 4 + Vue 3**（`<script setup lang="ts">`，TypeScript strict）+ **Tailwind**。
- **不引入任何 UI library**（無 shadcn / MUI / Element），一律用 Tailwind primitive 手刻。
- 後端：Nitro server routes（`server/api/`）+ Supabase（Postgres + Auth）。
- 元件放 `app/components/`、可複用邏輯放 `app/composables/`（`useXxx`）、頁面放 `app/pages/`（自動路由）。

## 語言與樣式

- **UI 文字用繁體中文，程式識別字用英文**。
- **台股顏色**：漲/獲利 = `text-red-500`；跌/虧損 = `text-green-600`；持平 = `text-slate-400`；主要操作/強調 = `indigo`。
- 中性色用 `slate` 系；圓角：卡片/視窗 `rounded-2xl`、按鈕/輸入框 `rounded-lg`、badge `rounded-full`。
- **金額欄位一律千分位**（focus 顯示純數字、blur `toLocaleString('zh-TW')`；不用 `type="number"`）。

## 響應式（RWD / 手機）— 每個功能都要一起做

- **每次開發都同時考慮手機**：純 Tailwind 斷點（`sm:`/`md:`/`lg:`），單一程式碼庫；不做雙版本、不偵測裝置、不引入行動元件庫（如 Vant/Varlet）。桌機外觀用 `sm:` 以上維持不變。
- **外殼已響應式**：sidebar 手機為抽屜 + 漢堡、`md:ml-60`、`p-4 md:p-6`，沿用即可。
- **每個 `<table>` 都必須有手機卡片版（含彈窗內的表格，唯一例外：純 2 欄 label｜value 窄表）**：桌機表格一律 `<div class="hidden sm:block overflow-x-auto"><table>…`；手機另做 `sm:hidden` 堆疊卡片列表（用同一份 computed 資料與格式 helper，別重算），分頁放在捲動容器外以保持可見。
  - **`overflow-x-auto` 只是桌機保險，不是手機解法**——手機出現左右捲動＝漏做卡片。**新增/改動任何表格後，逐一確認每個 `<table>` 都有對應的 `sm:hidden` 卡片**（可比對 `<table>` 數 vs `hidden sm:block`／`sm:hidden` 數）。
- **彈窗一律用 `<BottomSheet v-model>`**（`app/components/BottomSheet.vue`）：手機自動從底部滑上（拖曳握把＋安全區＋鎖背景捲動），桌機置中淡入。`title` prop 出標題列、`#header`／`#footer` 插槽放自訂標題與固定動作列、`max-width` 調寬度、`persistent` 禁止背景/Esc 關閉。**不要再手刻 `fixed inset-0` 彈窗**。日期選擇（v-calendar）手機已用全域 CSS override 成底部滿版日曆。
- **App 化互動已建好共用件，開發時直接沿用、勿重造**：
  - **Toast**：`const toast = useToast()` → `toast.success('已儲存')`／`.error(...)`；**不要用 `alert`**。全域 host（`app/components/Toast.vue`）已掛在 layout。
  - **下拉刷新**：清單頁在 setup 呼叫 `usePullToRefresh(refresh)` 即可（彈窗開啟時自動停用）。
  - **底部導覽**：`app/components/layout/BottomNav.vue`（手機 5 格）；要加主入口改這裡，桌機用側欄 `Sidebar.vue`。
  - **安全區**：貼齊螢幕邊緣的固定元素（header／底部列／sheet）加 `.safe-top`／`.safe-bottom`。
  - **手感**：可點元素靠全域 CSS 自動有按壓縮放回饋（僅 touch 裝置）；頁面要維持**單一根節點**（尾端 `<Teleport>` tooltip 要收進根 `<div>` 內），否則頁面轉場（`app.vue` 的 `<NuxtPage :transition>`）會失效。
- **全域規則在 `app/app.vue <style>` 與 `nuxt.config.ts`，勿破壞**：viewport 禁縮放；手機輸入框強制 16px 防 iOS 對焦放大（**別把輸入框字級設 <16px**）；UI 元件 `user-select:none`（但 `td`／卡片數據仍可長按複製，**別對 body 設禁選**）；`overscroll-behavior:none`。
- **觸控友善**：不要只靠 hover（tooltip 要可點擊、數秒自動收）或拖曳（要有 ▲▼ 等替代）；點擊區夠大。
- **PWA**（`@vite-pwa/nuxt`）：SW 只快取靜態資源、`/api` 一律 `NetworkOnly`；動到認證/資料流時別破壞這點。圖示在 `public/icons/`。

## 資料存取

- 讀資料用 `useAuthFetch('/api/...')`（自動帶 Bearer token、401 自動導回登入）。
- 寫資料（POST/PUT/DELETE）用全域 `$authFetch`，完成後呼叫對應的 `refresh()`。
- 認證：JWT + `useAuth` composable。伺服器端 `requireUser` 用 jose 驗證；解碼 JWT 時注意 **base64url**（Supabase ES256 token 含 `-` `_`，不能直接用 `atob`）。
- 資料以 Supabase **user id**（JWT `sub`）為 key，非 email。

## 工作方式

- **部署前先確認，不擅自部署**；commit / push 需經同意。
- 錯誤不要靜默吞掉，要讓使用者看得到原因。

## Skills（按需載入）

- **build-ui** — 建立/修改頁面、表格、彈跳視窗、表單、清單等 UI 時使用，內含完整程式碼範本。
- **generate-stock-manual** — 重新生成使用者操作手冊（DOCX）。
