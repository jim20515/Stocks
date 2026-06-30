export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const code = normalizeStockCode(getQuery(event).code)

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
