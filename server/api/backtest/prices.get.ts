export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const query = getQuery(event)

  const code = String(query.code ?? '').trim().toUpperCase()
  const startDate = String(query.startDate ?? '2004-01-01')
  const endDate = String(query.endDate ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }))

  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const { data, error } = await client
    .from('stock_daily_prices')
    .select('date, close_price')
    .eq('stock_code', code)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .limit(10000)

  if (error) throw createError({ statusCode: 500, message: error.message })

  return {
    code,
    prices: data ?? [],
  }
})
