// 主動在 access token 到期前換發新的，讓長時間開著頁面的使用者不會突然掉登入。
// middleware 只在「換頁時」補救；這個 plugin 負責「不換頁也持續續期」。
export default defineNuxtPlugin(() => {
  const { token } = useAuth()
  const { expiresAt, refresh } = useSessionRefresh()

  const SKEW_MS = 2 * 60 * 1000 // 提前 2 分鐘換發
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule() {
    if (timer) { clearTimeout(timer); timer = null }
    if (!token.value) return
    const exp = expiresAt()
    if (exp == null) return
    // 距離到期還有多久就換發；已過期或很接近就馬上換
    const delay = Math.max(0, exp - Date.now() - SKEW_MS)
    timer = setTimeout(async () => {
      await refresh()
      // refresh() 成功會更新 token，watch 會再排下一次；失敗則 token 被清空、停止排程
    }, delay)
  }

  // token 變動（登入/續期/登出）就重新排程
  watch(token, schedule, { immediate: true })

  // 從背景切回前景時，若已接近/超過到期就立即補一次（計時器在背景可能被節流）
  if (import.meta.client) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !token.value) return
      const exp = expiresAt()
      if (exp != null && exp - Date.now() < SKEW_MS) refresh()
    })
  }
})
