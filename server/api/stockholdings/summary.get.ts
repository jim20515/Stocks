export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: holdings, error }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('stock_code'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  const cashAmount = Number((settings as any)?.cash_amount ?? 0)

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!holdings?.length) {
    return { items: [], cashAmount, totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPct: 0, totalRealizedProfit: 0, priceDate: null }
  }

  // 計算每支股票的 WACC（只從買入筆數）
  const waccMap: Record<string, number> = {}
  const buyMap: Record<string, { totalCost: number; totalShares: number }> = {}
  for (const h of holdings) {
    if (h.shares > 0) {
      const code = h.stock_code.toUpperCase()
      if (!buyMap[code]) buyMap[code] = { totalCost: 0, totalShares: 0 }
      buyMap[code].totalCost += Number(h.average_cost) * h.shares
      buyMap[code].totalShares += h.shares
    }
  }
  for (const [code, { totalCost, totalShares }] of Object.entries(buyMap)) {
    waccMap[code] = totalShares > 0 ? totalCost / totalShares : 0
  }

  // 計算每支股票的淨持股（買入 - 賣出）
  const netSharesMap: Record<string, number> = {}
  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    netSharesMap[code] = (netSharesMap[code] ?? 0) + h.shares
  }

  const buyHoldings = holdings.filter(h => h.shares > 0)
  const codes = [...new Set(buyHoldings.map(h => h.stock_code))]
  const prices = await fetchPrices(codes)

  const items = holdings.map(h => {
    const isSell = h.shares < 0
    const currentPrice = prices[h.stock_code.toUpperCase()] ?? null
    const wacc = waccMap[h.stock_code.toUpperCase()] ?? Number(h.average_cost)

    if (isSell) {
      // 賣出行：averageCost = 賣出價，損益 = (賣出價 - WACC) × |shares|
      const sellPrice = Number(h.average_cost)
      const absShares = Math.abs(h.shares)
      const realizedProfit = Math.round((sellPrice - wacc) * absShares)
      const costBasis = Math.round(wacc * absShares)
      const profitPct = costBasis > 0 ? Math.round(realizedProfit / costBasis * 10000) / 100 : 0
      return {
        id: h.id,
        stockCode: h.stock_code,
        stockName: h.stock_name,
        shares: h.shares,
        averageCost: sellPrice,
        costBasis: Math.round(wacc * 100) / 100,
        buyDate: h.buy_date,
        leverageMultiplier: Number(h.leverage_multiplier),
        watermarkPrice: null,
        currentPrice: null,
        cost: -costBasis,
        value: 0,
        profit: realizedProfit,
        profitPct,
        isRealized: true,
      }
    }

    // 買入行：正常計算
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
      isRealized: false,
    }
  })

  const sellItems = items.filter(i => i.isRealized)

  // 總成本／總市值：用淨持股 × 均成本／現價
  let totalCost = 0
  let totalValue = 0
  for (const [codeUpper, netShares] of Object.entries(netSharesMap)) {
    if (netShares <= 0) continue
    const wacc = waccMap[codeUpper] ?? 0
    const price = prices[codeUpper] ?? null
    totalCost += wacc * netShares
    totalValue += price ? price * netShares : wacc * netShares
  }
  totalCost = Math.round(totalCost)
  totalValue = Math.round(totalValue)

  const totalProfit = totalValue - totalCost
  const totalProfitPct = totalCost > 0 && totalValue > 0
    ? Math.round(totalProfit / totalCost * 10000) / 100
    : 0
  const totalRealizedProfit = sellItems.reduce((s, i) => s + i.profit, 0)

  return {
    items,
    cashAmount,
    totalCost,
    totalValue,
    totalProfit: Math.round(totalProfit),
    totalProfitPct,
    totalRealizedProfit: Math.round(totalRealizedProfit),
    priceDate: new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
  }
})
