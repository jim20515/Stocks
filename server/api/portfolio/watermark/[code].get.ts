
interface YahooChartResp {
  chart: {
    result?: Array<{
      indicators: { quote: Array<{ high: (number | null)[] }> }
    }>
  }
}

async function fetchATH(code: string): Promise<number | null> {
  for (const suffix of ['.TW', '.TWO']) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1mo&range=max&includePrePost=false`
      const data = await $fetch<YahooChartResp>(url)
      const highs = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.high ?? []
      const ath = Math.max(...highs.filter((v): v is number => v !== null && !isNaN(v)))
      if (isFinite(ath) && ath > 0) return Math.round(ath * 100) / 100
    } catch {}
  }
  return null
}

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const code = getRouterParam(event, 'code')?.trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const { data: holding, error } = await client
    .from('stock_holdings')
    .select('*')
    .eq('stock_code', code)
    .eq('user_id', userId)
    .single()

  if (error || !holding) throw createError({ statusCode: 404, message: '找不到此持股' })

  const [prices, ath] = await Promise.all([
    fetchPrices([code]),
    fetchATH(code),
  ])

  const currentPrice = prices[code] ?? null
  const drawdownPct = ath && currentPrice
    ? Math.round((currentPrice - ath) / ath * 10000) / 100
    : 0

  const levels = [0.1, 0.2, 0.3].map(pct => ({
    pct: Math.round(pct * 100),
    up: ath ? Math.round(ath * (1 + pct) * 100) / 100 : null,
    down: ath ? Math.round(ath * (1 - pct) * 100) / 100 : null,
  }))

  return {
    stockCode: holding.stock_code,
    stockName: holding.stock_name,
    currentPrice,
    watermarkPrice: ath,
    drawdownPct,
    levels,
  }
})
