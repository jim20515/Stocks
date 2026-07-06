// 註冊前置檢查：確認 email 尚未註冊（已註冊就擋下請對方登入）。
// 實際的驗證連結改由「前端」用 supabase.signInWithOtp 寄出——這樣 PKCE 的 code verifier
// 才會存在使用者的瀏覽器，點連結回來時才能完成交換、建立 session（伺服器端寄會導致逾時）。
export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  if (!email) throw createError({ statusCode: 400, message: '請輸入 Email' })
  const normalizedEmail = String(email).trim().toLowerCase()
  checkRateLimit(event, `register:${normalizedEmail}`, 5, 60 * 60 * 1000)

  // 用 service_role 的 admin API 查有沒有這個 email（本機無 service key 時略過檢查）
  const admin = useServiceDb()
  if (admin) {
    let page = 1
    while (page < 50) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) break
      const list = data?.users ?? []
      if (list.some(u => (u.email ?? '').toLowerCase() === normalizedEmail)) {
        throw createError({ statusCode: 409, message: '此 Email 已註冊，請直接登入' })
      }
      if (list.length < 200) break
      page++
    }
  }

  await logEvent(event, 'auth.register', { email: normalizedEmail })
  return { ok: true }
})
