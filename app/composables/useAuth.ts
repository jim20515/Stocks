export function useAuth() {
  const token = useCookie<string | null>('sb_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 天
    sameSite: 'lax',
    secure: true,
  })
  const user = useCookie<{ id: string; email: string } | null>('sb_user', {
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
    secure: true,
  })

  const isLoggedIn = computed(() => !!token.value)

  function setSession(accessToken: string, userData: { id: string; email: string }) {
    token.value = accessToken
    user.value = userData
  }

  function clearSession() {
    token.value = null
    user.value = null
  }

  const authHeaders = computed(() => token.value
    ? { Authorization: `Bearer ${token.value}` }
    : {}
  )

  return { token, user, isLoggedIn, setSession, clearSession, authHeaders }
}
