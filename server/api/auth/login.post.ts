import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)
  if (!email || !password) throw createError({ statusCode: 400, message: '請輸入 Email 和密碼' })

  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_KEY ?? useRuntimeConfig().supabaseKey as string
  const client = createClient(url, key)

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw createError({ statusCode: 401, message: error.message })

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email },
  }
})
