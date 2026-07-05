// 稽核記錄工具。用 service_role 用戶端寫入 activity_log（前端無法直接寫）。
// 失敗一律吞掉，log 絕不能影響正常請求。

// 從 JWT 輕量取出 sub（endpoint 多半已用 requireUser 驗過；這裡只取值不再驗簽）
function decodeSub(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json).sub ?? null
  } catch {
    return null
  }
}

export async function logEvent(event: any, name: string, detail?: any, userIdOverride?: string | null): Promise<void> {
  try {
    const client = useServiceDb()
    if (!client) return
    const token = getBearerToken(event)
    // 登入/註冊當下請求沒有 token，用 userIdOverride 指定是哪個帳號
    const userId = userIdOverride ?? (token ? decodeSub(token) : null)
    const forwarded = String(getHeader(event, 'x-forwarded-for') ?? '').split(',')[0].trim()
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? forwarded ?? null
    await client.from('activity_log').insert({
      user_id: userId,
      is_guest: !userId,
      ip,
      event: name,
      detail: detail ?? null,
    })
  } catch {
    // 靜默：稽核失敗不影響主流程
  }
}
