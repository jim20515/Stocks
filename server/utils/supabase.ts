import { createClient } from '@supabase/supabase-js'

export function useDb() {
  const config = useRuntimeConfig()
  return createClient(
    config.supabaseUrl as string,
    config.supabaseKey as string,
  )
}
