export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const code = String(getQuery(event).code ?? '').trim().toUpperCase()

  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const { data, error } = await client
    .from('stock_daily_prices')
    .select('date')
    .eq('stock_code', code)
    .order('date', { ascending: false })
    .limit(1)

  if (error) throw createError({ statusCode: 500, message: error.message })

  return {
    code,
    latestDate: data?.[0]?.date ?? null,
  }
})
