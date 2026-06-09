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
