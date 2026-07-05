import { createClient } from '@supabase/supabase-js'

export function useDb(token?: string | null) {
  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_KEY ?? useRuntimeConfig().supabaseKey as string
  if (token) {
    return createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
  }
  return createClient(url, key)
}

// service_role 用戶端（server 專用，繞過 RLS）。未設定 SUPABASE_SERVICE_KEY 時回 null。
// 用於「訪客也能觸發更新共用股價表」：訪客只能觸發，實際寫入由 server 用此金鑰控管。
export function useServiceDb() {
  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_SERVICE_KEY ?? (useRuntimeConfig() as any).supabaseServiceKey
  if (!url || !key) return null
  return createClient(url as string, key as string, { auth: { persistSession: false } })
}
