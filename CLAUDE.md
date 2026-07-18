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
- **彈窗手機用底部 sheet**：`items-end sm:items-center`、`rounded-t-2xl sm:rounded-2xl`、`max-h-[90vh] overflow-y-auto`（矮螢幕要能捲到送出鈕）。
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
