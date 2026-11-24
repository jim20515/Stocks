import { fetchSplitAdjustedATH } from '~~/server/utils/athPrice'


export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const code = getRouterParam(event, 'code')?.trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const { data: holdings, error } = await client
    .from('stock_holdings')
    .select('*')
    .eq('stock_code', code)
    .eq('user_id', userId)
    .limit(1)

  const holding = holdings?.[0]
  if (error || !holding) throw createError({ statusCode: 404, message: '找不到此持股' })

  const [prices, ath] = await Promise.all([
    fetchPrices([code]),
    fetchSplitAdjustedATH(code, client),
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
