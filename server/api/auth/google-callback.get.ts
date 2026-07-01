import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export default defineEventHandler(async (event) => {
  const { code } = getQuery(event)
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, message: '缺少 code 參數' })
  }

  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_KEY!

  const cookies: Record<string, string> = {}
  const newCookies: string[] = []

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(getHeader(event, 'cookie') ?? '')
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          newCookies.push(serializeCookieHeader(name, value, options))
        })
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    throw createError({ statusCode: 400, message: error.message })
  }

  // 把 supabase 設的 cookie 轉給瀏覽器
  newCookies.forEach(c => appendHeader(event, 'set-cookie', c))

  return {
    accessToken: data.session.access_token,
    user: { id: data.session.user.id, email: data.session.user.email ?? '' },
  }
})
