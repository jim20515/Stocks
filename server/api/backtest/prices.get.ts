export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const query = getQuery(event)

  const code = normalizeStockCode(query.code)
  const startDate = normalizeDate(query.startDate ?? '2004-01-01', '開始日期')
  const endDate = normalizeDate(query.endDate ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }), '結束日期')
  if (new Date(startDate) > new Date(endDate)) {
    throw createError({ statusCode: 400, message: '日期區間不正確' })
  }

  // Supabase 專案 max-rows = 1000，分頁抓取全部資料
  const PAGE = 1000
  const allPrices: { date: string; close_price: number }[] = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .range(from, from + PAGE - 1)

    if (error) throw createError({ statusCode: 500, message: error.message })
    if (!data?.length) break
    allPrices.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return { code, prices: allPrices }
})
