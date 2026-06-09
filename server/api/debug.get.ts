export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  try {
    const client = useDb()
    const { data, error } = await client.from('portfolio_settings').select('id').limit(1)
    return {
      hasUrl: !!config.supabaseUrl,
      hasKey: !!config.supabaseKey,
      urlPrefix: (config.supabaseUrl as string)?.slice(0, 30) ?? null,
      dbOk: !error,
      dbError: error?.message ?? null,
      data,
    }
  } catch (e: any) {
    return {
      hasUrl: !!config.supabaseUrl,
      hasKey: !!config.supabaseKey,
      urlPrefix: (config.supabaseUrl as string)?.slice(0, 30) ?? null,
      thrown: e?.message ?? String(e),
    }
  }
})
