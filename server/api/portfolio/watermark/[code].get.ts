
export default defineEventHandler(async (event) => {
  const client = useDb()
  const code = getRouterParam(event, 'code')?.trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const { data: holding, error } = await client
    .from('stock_holdings')
    .select('*')
    .eq('stock_code', code)
    .single()

  if (error || !holding) throw createError({ statusCode: 404, message: '找不到此持股' })

  const prices = await fetchPrices([code])
  const currentPrice = prices[code] ?? null
  const atv = holding.watermark_price ? Number(holding.watermark_price) : null

  const drawdownPct = atv && currentPrice
    ? Math.round((currentPrice - atv) / atv * 10000) / 100
    : 0

  const levels = [0.1, 0.2, 0.3].map(pct => ({
    pct: Math.round(pct * 100),
    up: atv ? Math.round(atv * (1 + pct) * 100) / 100 : null,
    down: atv ? Math.round(atv * (1 - pct) * 100) / 100 : null,
  }))

  return {
    stockCode: holding.stock_code,
    stockName: holding.stock_name,
    currentPrice,
    watermarkPrice: atv,
    drawdownPct,
    levels,
  }
})
