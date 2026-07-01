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

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login' || to.path === '/auth/callback') return
  const { token, clearSession } = useAuth()
  if (!token.value || isTokenExpired(token.value)) {
    clearSession()
    return navigateTo('/login')
  }
})
