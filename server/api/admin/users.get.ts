import { createClient } from '@supabase/supabase-js'

// 列出所有註冊帳號（管理員限定）。用 service_role 的 admin API 取全部使用者。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const serviceKey = process.env.NUXT_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? (useRuntimeConfig() as any).supabaseServiceKey
  if (!serviceKey) throw createError({ statusCode: 500, message: 'NUXT_SUPABASE_SECRET_KEY 未設定' })
  const admin = createClient(url as string, serviceKey as string, { auth: { persistSession: false } })

  // 取全部使用者（分頁）
  const all: any[] = []
  let page = 1
  while (page < 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw createError({ statusCode: 500, message: error.message })
    const users = data?.users ?? []
    all.push(...users)
    if (users.length < 200) break
    page++
  }

  // 管理員集合
  const { data: adminRows } = await admin.from('app_admins').select('user_id')
  const adminSet = new Set((adminRows ?? []).map((r: any) => r.user_id))

  const users = all.map(u => ({
    id: u.id,
    email: u.email,
    providers: (u.app_metadata?.providers ?? (u.app_metadata?.provider ? [u.app_metadata.provider] : [])),
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at,
    isAdmin: adminSet.has(u.id),
  }))
  // 依最後登入排序（新→舊），沒登入過的排最後
  users.sort((a, b) => (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? ''))

  return { users, total: users.length }
})
