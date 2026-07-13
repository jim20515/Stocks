import { createClient } from '@supabase/supabase-js'

// 用 refresh token 向 Supabase 換發新的 access token（+ 輪替後的新 refresh token）。
// 讓前端的短效 access token 過期後能無痛續期，使用者不必重新登入。
export default defineEventHandler(async (event) => {
  const { refreshToken } = await readBody(event)
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw createError({ statusCode: 400, message: '缺少 refresh token' })
  }

  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_KEY ?? useRuntimeConfig().supabaseKey as string
  const client = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) {
    // refresh token 失效／被撤銷／過期 → 要求重新登入
    throw createError({ statusCode: 401, message: '登入已過期，請重新登入' })
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: data.session.user.id,
      email: data.session.user.email ?? '',
      needsPassword: (data.session.user.user_metadata as any)?.password_set === false,
    },
  }
})
