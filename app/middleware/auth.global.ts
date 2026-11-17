function decodeJwtPayload(token: string): any {
  const part = token.split('.')[1]
  if (!part) throw new Error('malformed token')
  // JWT 使用 base64url 編碼，atob 只支援標準 base64，需先轉換
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const json = decodeURIComponent(
    atob(padded).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  )
  return JSON.parse(json)
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token)
    if (typeof payload.exp !== 'number') return true
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/auth/callback' || to.path === '/reset-password') return
  const { token, user, refreshToken, clearSession } = useAuth()

  // 1. 若在登入頁：若已有有效 token 則導回首頁，否則放行
  if (to.path === '/login') {
    if (token.value && !isTokenExpired(token.value)) {
      return navigateTo('/')
    }
    return
  }

  // 2. 若 access token 過期，嘗試無痛續期；若無 refresh token 或續期失敗，清 session 並強制導向登入頁
  if (token.value && isTokenExpired(token.value)) {
    if (refreshToken.value) {
      const ok = await useSessionRefresh().refresh()
      if (!ok) {
        clearSession()
        return navigateTo('/login')
      }
    } else {
      clearSession()
      return navigateTo('/login')
    }
  }

  // 3. 若無 token（未登入），一律強制導向登入頁
  if (!token.value) {
    clearSession()
    return navigateTo('/login')
  }

  // 4. 無密碼註冊者第一次進來一定要先設定密碼，設好前不放行到其他頁
  if (token.value && user.value?.needsPassword && to.path !== '/set-password') {
    return navigateTo('/set-password')
  }
})
