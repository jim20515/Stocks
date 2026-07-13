export function useAuth() {
  const secureCookie = import.meta.client
    ? window.location.protocol === 'https:'
    : process.env.NODE_ENV === 'production'

  const token = useCookie<string | null>('sb_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 天
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
  })
  const user = useCookie<{ id: string; email: string; needsPassword?: boolean } | null>('sb_user', {
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
  })
  // refresh token：access token 過期後用它換發新的，讓使用者長期不用重登
  const refreshToken = useCookie<string | null>('sb_refresh', {
    maxAge: 60 * 60 * 24 * 30, // 30 天（實際壽命仍由 Supabase 端控管）
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
  })

  if (import.meta.client) {
    if (!token.value) token.value = localStorage.getItem('sb_token')
    if (!refreshToken.value) refreshToken.value = localStorage.getItem('sb_refresh')
    if (!user.value) {
      const storedUser = localStorage.getItem('sb_user')
      if (storedUser) {
        try {
          user.value = JSON.parse(storedUser)
        } catch {
          localStorage.removeItem('sb_user')
        }
      }
    }
  }

  const isLoggedIn = computed(() => !!token.value)

  function setSession(
    accessToken: string,
    userData: { id: string; email: string; needsPassword?: boolean },
    newRefreshToken?: string | null,
  ) {
    token.value = accessToken
    user.value = userData
    if (newRefreshToken) refreshToken.value = newRefreshToken

    if (import.meta.client) {
      const maxAge = 60 * 60 * 24 * 7
      const secure = secureCookie ? '; Secure' : ''
      document.cookie = `sb_token=${encodeURIComponent(accessToken)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
      document.cookie = `sb_user=${encodeURIComponent(JSON.stringify(userData))}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
      localStorage.setItem('sb_token', accessToken)
      localStorage.setItem('sb_user', JSON.stringify(userData))
      if (newRefreshToken) {
        const refreshMaxAge = 60 * 60 * 24 * 30
        document.cookie = `sb_refresh=${encodeURIComponent(newRefreshToken)}; Max-Age=${refreshMaxAge}; Path=/; SameSite=Lax${secure}`
        localStorage.setItem('sb_refresh', newRefreshToken)
      }
    }
  }

  function clearSession() {
    token.value = null
    user.value = null
    refreshToken.value = null

    if (import.meta.client) {
      document.cookie = 'sb_token=; Max-Age=0; Path=/; SameSite=Lax'
      document.cookie = 'sb_user=; Max-Age=0; Path=/; SameSite=Lax'
      document.cookie = 'sb_refresh=; Max-Age=0; Path=/; SameSite=Lax'
      localStorage.removeItem('sb_token')
      localStorage.removeItem('sb_user')
      localStorage.removeItem('sb_refresh')
    }
  }

  const authHeaders = computed(() => token.value
    ? { Authorization: `Bearer ${token.value}` }
    : {}
  )

  return { token, user, refreshToken, isLoggedIn, setSession, clearSession, authHeaders }
}
