import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)
  if (!email || !password) throw createError({ statusCode: 400, message: '請輸入 Email 和密碼' })
  const normalizedEmail = String(email).trim().toLowerCase()
  checkRateLimit(event, `login:${normalizedEmail}`, 8, 15 * 60 * 1000)

  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_KEY ?? useRuntimeConfig().supabaseKey as string
  const client = createClient(url, key)

  const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
  if (error) throw createError({ statusCode: 401, message: 'Email 或密碼錯誤' })

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email },
  }
})
