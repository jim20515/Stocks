export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: holdings, error }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  const cashAmount = Number((settings as any)?.cash_amount ?? 0)

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!holdings?.length) {
    return { items: [], cashAmount, totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPct: 0, totalRealizedProfit: 0, priceDate: null }
  }

  // 按交易日排序後，逐筆計算每檔股票在「賣出當下」的歷史 WACC
  // runningMap: 記錄目前累積的買入成本與股數（隨時間推進）
  const runningMap: Record<string, { totalCost: number; totalShares: number }> = {}
  // sellWaccMap: 每筆賣出記錄對應的歷史 WACC（用 id 為 key）
  const sellWaccMap: Record<number, number> = {}

  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    if (!runningMap[code]) runningMap[code] = { totalCost: 0, totalShares: 0 }

    if (h.shares > 0) {
      // 買入：累積加權成本
      runningMap[code].totalCost += Number(h.average_cost) * h.shares
      runningMap[code].totalShares += h.shares
    } else {
      // 賣出：記錄此時的 WACC，再從累積中扣除
      const { totalCost, totalShares } = runningMap[code]
      const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
      sellWaccMap[h.id] = wacc
      const absShares = Math.abs(h.shares)
      runningMap[code].totalCost -= wacc * absShares
      runningMap[code].totalShares -= absShares
      if (runningMap[code].totalShares < 0) runningMap[code].totalShares = 0
      if (runningMap[code].totalCost < 0) runningMap[code].totalCost = 0
    }
  }

  // 計算最終 WACC（剩餘持股用）
  const finalWaccMap: Record<string, number> = {}
  for (const [code, { totalCost, totalShares }] of Object.entries(runningMap)) {
    finalWaccMap[code] = totalShares > 0 ? totalCost / totalShares : 0
  }

  // 計算每支股票的淨持股（買入 - 賣出）
  const netSharesMap: Record<string, number> = {}
  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    netSharesMap[code] = (netSharesMap[code] ?? 0) + h.shares
  }

  const buyHoldings = holdings.filter(h => h.shares > 0)
  const codes = [...new Set(buyHoldings.map(h => h.stock_code))]
  const priceInfos = await fetchPricesWithChange(codes)
  const prices: Record<string, number> = {}
  for (const [code, info] of Object.entries(priceInfos)) prices[code] = info.price

  const items = holdings.map(h => {
    const isSell = h.shares < 0
    const codeUpper = h.stock_code.toUpperCase()
    const currentPrice = prices[codeUpper] ?? null
    const dailyChangePct = priceInfos[codeUpper]?.changePct ?? null

    if (isSell) {
      // 賣出行：使用賣出當下的歷史 WACC
      const wacc = sellWaccMap[h.id] ?? Number(h.average_cost)
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
        account: h.account ?? null,
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

    // 買入行：正常計算（cost 用原始 average_cost，顯示用；總計用 finalWacc）
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
      account: h.account ?? null,
      leverageMultiplier: Number(h.leverage_multiplier),
      watermarkPrice: h.watermark_price ? Number(h.watermark_price) : null,
      currentPrice,
      dailyChangePct,
      cost: Math.round(cost),
      value: Math.round(value),
      profit: Math.round(profit),
      profitPct,
      isRealized: false,
    }
  })

  const sellItems = items.filter(i => i.isRealized)

  // 總成本／總市值：用淨持股 × 最終均成本／現價
  let totalCost = 0
  let totalValue = 0
  let totalPrevValue = 0   // 昨日市值（用昨收計算）
  for (const [codeUpper, netShares] of Object.entries(netSharesMap)) {
    if (netShares <= 0) continue
    const wacc = finalWaccMap[codeUpper] ?? 0
    const info = priceInfos[codeUpper]
    const price = info?.price ?? null
    const prevClose = info?.prevClose ?? null
    totalCost += wacc * netShares
    totalValue += price ? price * netShares : wacc * netShares
    totalPrevValue += prevClose ? prevClose * netShares : (price ?? wacc) * netShares
  }
  totalCost = Math.round(totalCost)
  totalValue = Math.round(totalValue)

  // 今日漲跌（股票部位，不含現金），用 MIS 即時昨收計算
  const dailyChange = Math.round(totalValue - totalPrevValue)
  const dailyChangePct = totalPrevValue > 0
    ? Math.round(dailyChange / totalPrevValue * 10000) / 100
    : null

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
    dailyChange,
    dailyChangePct,
    totalProfit: Math.round(totalProfit),
    totalProfitPct,
    totalRealizedProfit: Math.round(totalRealizedProfit),
    priceDate: new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
  }
})
