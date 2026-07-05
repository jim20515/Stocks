// 全域稽核：每個 /api 請求回應後記一筆（誰、端點、狀態碼）。
// 用 afterResponse hook（回應已送出後才寫，不影響使用者延遲）。
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', async (event) => {
    try {
      const path = (event.path ?? '').split('?')[0]
      if (!path.startsWith('/api/')) return
      if (path.startsWith('/api/cron/')) return   // 不記排程（含清除本身）
      const status = getResponseStatus(event)
      await logEvent(event, `${event.method} ${path}`, { status })
    } catch {
      // 靜默
    }
  })
})
