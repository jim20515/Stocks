// access token 續期的共用邏輯，middleware 與 client plugin 都用這一份。
function decodeJwtPayload(token: string): any {
  const part = token.split('.')[1]
  if (!part) throw new Error('malformed token')
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const json = decodeURIComponent(
    atob(padded).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  )
  return JSON.parse(json)
}

export function useSessionRefresh() {
  const { token, refreshToken, setSession, clearSession } = useAuth()

  // 回傳 access token 的到期時間（ms）；無法解析回傳 null
  function expiresAt(): number | null {
    if (!token.value) return null
    try {
      const payload = decodeJwtPayload(token.value)
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null
    } catch {
      return null
    }
  }

  function isExpired(): boolean {
    const exp = expiresAt()
    return exp == null ? true : exp < Date.now()
  }

  // 用 refresh token 換發新 session。成功回傳 true；失敗（token 撤銷/過期）清 session 回傳 false。
  // 同時間多次呼叫會共用同一個進行中的請求，避免重複打 refresh。
  let inflight: Promise<boolean> | null = null
  function refresh(): Promise<boolean> {
    if (inflight) return inflight
    if (!refreshToken.value) return Promise.resolve(false)
    inflight = (async () => {
      try {
        const data = await $fetch<any>('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken: refreshToken.value },
        })
        setSession(data.accessToken, data.user, data.refreshToken)
        return true
      } catch {
        clearSession()
        return false
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  return { expiresAt, isExpired, refresh }
}
