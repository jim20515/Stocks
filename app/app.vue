<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
  </div>
</template>

<style>
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { overscroll-behavior-y: none; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }

/* App 感：UI 元件不可選取 / 不跳長按選單；資料文字（td、卡片內文）維持可選可複製 */
button, a, label, nav, header, [role="button"], .no-select {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 安全區內距 util（瀏海 / Home 指示條）；供 header / footer / sheet / bottom-nav 使用 */
.safe-top { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-l { padding-left: env(safe-area-inset-left); }

/* 手機專屬：防 iOS 對焦自動放大（輸入字級 <16px 會放大）、隱藏捲軸、慣性捲動 */
@media (max-width: 639px) {
  input, select, textarea { font-size: 16px !important; }
  * { -webkit-overflow-scrolling: touch; }
  ::-webkit-scrollbar { display: none; }
}

/* 觸控裝置：按壓縮放回饋（桌機滑鼠不套用，維持零回歸） */
@media (hover: none) {
  button:not(:disabled), [role="button"], a[href] { transition: transform 0.1s ease; }
  button:not(:disabled):active, [role="button"]:active, a[href]:active { transform: scale(0.97); }
}

/* 彈窗淡入 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 頁面切換轉場（P3 由 NuxtPage :transition 啟用） */
.page-enter-active, .page-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; }
</style>
