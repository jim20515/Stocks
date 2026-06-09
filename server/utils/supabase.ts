import { createClient } from '@supabase/supabase-js'

export function useDb() {
  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const key = process.env.SUPABASE_KEY ?? useRuntimeConfig().supabaseKey as string
  return createClient(url, key)
}
