# [專案名稱] 專案指引

> **通用後台範本。** 開新專案時：①把這行標題與下方「專案專屬設定」改成該專案的內容 → ②其餘設計系統與慣例整份沿用 → ③確認共用元件已帶入（見最後一節「共用基礎建設」）。
> 只複製本檔**不會**讓新後台自動長一樣——真正決定外觀一致的是「共用元件」，務必一起帶過去（copy 或 Nuxt layer `extends`）。

---

## 專案專屬設定（每個新專案先填這一區，其餘不用動）

- **領域 / 用途**：<一句話說明這個後台在管什麼>
- **色彩語意覆寫**：預設 success/正向＝`green`、danger/破壞性＝`red`。<若領域有特殊語意（例：台股「紅漲綠跌」要對調），在此明確定義；否則刪掉這句>
- **特殊資料格式**：<例：金額千分位、日期 `YYYY-MM-DD`、民國轉西元…沒有就寫「無」>
- **主要導覽項目**：<列出 Sidebar / BottomNav 要放的入口，例：總覽 / 訂單 / 使用者 / 設定>
- **認證 / 資料來源**：<例：Supabase Auth（JWT）+ Postgres；或其他>

---

## 技術棧

- **Nuxt 4 + Vue 3**（`<script setup lang="ts">`，TypeScript strict）+ **Tailwind**。
- **不引入任何 UI library**（無 shadcn / MUI / Element / Vant），一律用 Tailwind primitive 手刻。
- 後端：Nitro server routes（`server/api/`）+ Supabase（Postgres + Auth）。＊資料來源不同時，改「專案專屬設定」。
- 元件放 `app/components/`、可複用邏輯放 `app/composables/`（`useXxx`）、頁面放 `app/pages/`（自動路由）、跨頁外殼放 `app/layouts/`。

## 語言與樣式（設計系統）

- **UI 文字用繁體中文，程式識別字用英文**。
- **色彩語意**（預設值；領域特殊語意在「專案專屬設定」覆寫）：
  - 主要操作 / 強調＝`indigo`；中性色＝`slate` 系。
  - 正向 / 成功＝`green`；危險 / 破壞性 / 錯誤＝`red`；警告＝`amber`。
  - ＊金融類特殊語意（例：台股「紅漲綠跌」正負對調）請在「專案專屬設定」明確覆寫。
- 圓角：卡片 / 視窗 `rounded-2xl`、按鈕 / 輸入框 `rounded-lg`、badge `rounded-full`。
- **金額 / 大數字一律千分位**（focus 顯示純數字、blur `toLocaleString`；**不用 `type="number"`**，改文字框自行格式化）。
- 每個畫面都要有**載入中 / 空狀態 / 錯誤**三種樣子，別留空白或整頁卡住。

## 響應式（RWD / 手機）— 每個功能都要一起做

- **每次開發都同時考慮手機**：純 Tailwind 斷點（`sm:`/`md:`/`lg:`），單一程式碼庫；不做雙版本、不偵測裝置、不引入行動元件庫。桌機外觀用 `sm:` 以上維持不變。
- **外殼已響應式**：sidebar 手機為抽屜 + 漢堡、`md:ml-60`、`p-4 md:p-6`，沿用即可。
- **每個 `<table>` 都必須有手機卡片版（含彈窗內的表格，唯一例外：純 2 欄 label｜value 窄表）**：桌機表格一律 `<div class="hidden sm:block overflow-x-auto"><table>…`；手機另做 `sm:hidden` 堆疊卡片列表（用**同一份** computed 資料與格式 helper，別重算），分頁放在捲動容器外以保持可見。
  - **`overflow-x-auto` 只是桌機保險，不是手機解法**——手機出現左右捲動＝漏做卡片。**新增/改動任何表格後，逐一確認每個 `<table>` 都有對應的 `sm:hidden` 卡片**（比對 `<table>` 數 vs `hidden sm:block`／`sm:hidden` 數）。
- **彈窗一律用 `<BottomSheet v-model>`**（`app/components/BottomSheet.vue`）：手機自動從底部滑上（拖曳握把＋安全區＋鎖背景捲動），桌機置中淡入。`title` prop 出標題列、`#header`／`#footer` 插槽放自訂標題與固定動作列、`max-width` 調寬度、`persistent` 禁背景/Esc 關閉。**不要再手刻 `fixed inset-0` 彈窗**。日期選擇（v-calendar）手機用全域 CSS override 成底部滿版日曆。
- **App 化互動已建好共用件，直接沿用、勿重造**：
  - **Toast**：`const toast = useToast()` → `toast.success('已儲存')`／`.error(...)`；**不要用 `alert`**。全域 host（`app/components/Toast.vue`）掛在 layout。
  - **下拉刷新**：清單頁在 setup 呼叫 `usePullToRefresh(refresh)`（彈窗開啟時自動停用）。
  - **底部導覽**：`app/components/layout/BottomNav.vue`（手機 5 格）；要加主入口改這裡，桌機用側欄 `Sidebar.vue`。
  - **安全區**：貼齊螢幕邊緣的固定元素（header／底部列／sheet）加 `.safe-top`／`.safe-bottom`。
  - **手感**：可點元素靠全域 CSS 自動有按壓縮放回饋（僅 touch 裝置）；頁面要維持**單一根節點**（尾端 `<Teleport>` tooltip 收進根 `<div>` 內），否則頁面轉場失效。
- **全域規則在 `app/app.vue <style>` 與 `nuxt.config.ts`，勿破壞**：viewport 禁縮放；手機輸入框強制 16px 防 iOS 對焦放大（**別把輸入框字級設 <16px**）；UI 元件 `user-select:none`（但 `td`／卡片數據仍可長按複製，**別對 body 設禁選**）；`overscroll-behavior:none`。
- **觸控友善**：不要只靠 hover（tooltip 要可點擊、數秒自動收）或拖曳（要有 ▲▼ 等替代）；點擊區夠大。
- **PWA**（`@vite-pwa/nuxt`）：SW 只快取靜態資源、`/api` 一律 `NetworkOnly`；動到認證/資料流時別破壞這點。圖示在 `public/icons/`。

## 資料存取

- 讀資料用 `useAuthFetch('/api/...')`（自動帶 Bearer token、401 自動導回登入）。
- 寫資料（POST/PUT/DELETE）用全域 `$authFetch`，完成後呼叫對應的 `refresh()`，成功用 `toast.success(...)` 提示。
- 認證：JWT + `useAuth` composable。伺服器端驗 token 注意 **base64url**（ES256 token 含 `-` `_`，不能直接 `atob`）。
- 資料以認證系統的 **user id** 為 key，不要用 email。
- **部分更新要先讀舊值再合併**（PUT 只帶部分欄位時，用 `body.x ?? existing.x ?? default`，避免沒帶到的欄位被預設值覆蓋清空）。

## 工作方式

- **部署前先確認，不擅自部署**；commit / push 需經同意。
- 錯誤不要靜默吞掉，要讓使用者看得到原因。
- 每做一個段落就 build 驗證（`npm run build`）再往下。

## 共用基礎建設（新專案第一次就建立，或從 starter / Nuxt layer 帶入）

> 這些是「每個後台長得一致」的關鍵。只帶 CLAUDE.md 不夠，下列**實體檔案**要一起帶；若新專案還沒有，第一次就依上面規範建立。

- `app/app.vue` 的全域 `<style>`（禁縮放高光、16px 輸入、UI 禁選、overscroll、安全區 util、按壓回饋、頁面轉場）＋ `<NuxtPage :transition>`。
- `nuxt.config.ts` 的 `app.head`（viewport / theme-color / apple-*）與 `pwa` 設定。
- `app/layouts/default.vue`（外殼：sidebar + header + 底部導覽 + Toast host + 下拉刷新指示器）。
- `app/components/BottomSheet.vue`、`app/components/Toast.vue`、`app/composables/useToast.ts`、`app/composables/usePullToRefresh.ts`。
- `app/components/layout/{Sidebar,AppHeader,BottomNav}.vue`（導覽項目改成該專案的）。
- 認證：`app/composables/useAuth.ts` + `server/utils/requireUser`（或等價）。
