// 訪客攔截：非登入者點寫入/個人動作時，彈出「請先登入」提示視窗
export function useGuestGate() {
  const { isLoggedIn } = useAuth()
  const showLoginPrompt = useState('showLoginPrompt', () => false)
  const isGuest = computed(() => !isLoggedIn.value)

  // 用法：寫入 handler 開頭 `if (isGuest.value) return promptLogin()`
  function promptLogin() {
    showLoginPrompt.value = true
    return true
  }

  return { isGuest, promptLogin, showLoginPrompt }
}
