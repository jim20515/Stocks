// 公開歷史股價（訪客回測工具用）。不需登入；讀共用的 stock_daily_prices（RLS 已放寬為公開可讀）。
export default defineEventHandler(async (event) => {
  checkRateLimit(event, 'public-prices', 120, 60 * 1000)
  const client = useDb() // anon
  const query = getQuery(event)

  const code = normalizeStockCode(query.code)
  const startDate = normalizeDate(query.startDate ?? '2004-01-01', '開始日期')
  const endDate = normalizeDate(query.endDate ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }), '結束日期')
  if (new Date(startDate) > new Date(endDate)) {
    throw createError({ statusCode: 400, message: '日期區間不正確' })
  }

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
