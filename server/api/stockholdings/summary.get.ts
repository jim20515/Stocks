
export default defineEventHandler(async (event) => {
  const client = useDb()
  const { data: holdings, error } = await client
    .from('stock_holdings')
    .select('*')
    .order('stock_code')

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!holdings?.length) {
    return { items: [], totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPct: 0, priceDate: null }
  }

  const codes = [...new Set(holdings.map(h => h.stock_code))]
  const prices = await fetchPrices(codes)

  const items = holdings.map(h => {
    const currentPrice = prices[h.stock_code.toUpperCase()] ?? null
    const cost = Number(h.average_cost) * h.shares
    const value = currentPrice ? currentPrice * h.shares : 0
    const profit = value - cost
    const profitPct = cost > 0 && value > 0 ? Math.round(profit / cost * 10000) / 100 : 0
    return {
      id: h.id,
      stockCode: h.stock_code,
      stockName: h.stock_name,
      shares: h.shares,
      averageCost: Number(h.average_cost),
      buyDate: h.buy_date,
      leverageMultiplier: Number(h.leverage_multiplier),
      watermarkPrice: h.watermark_price ? Number(h.watermark_price) : null,
      currentPrice,
      cost: Math.round(cost),
      value: Math.round(value),
      profit: Math.round(profit),
      profitPct,
    }
  })

  const totalCost = items.reduce((s, i) => s + i.cost, 0)
  const totalValue = items.reduce((s, i) => s + i.value, 0)
  const totalProfit = totalValue - totalCost
  const totalProfitPct = totalCost > 0 && totalValue > 0
    ? Math.round(totalProfit / totalCost * 10000) / 100
    : 0

  return {
    items,
    totalCost,
    totalValue,
    totalProfit: Math.round(totalProfit),
    totalProfitPct,
    priceDate: new Date().toLocaleString('zh-TW', { hour12: false }),
  }
})
