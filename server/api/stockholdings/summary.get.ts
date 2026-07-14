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

  // runningMap: account → code → { totalCost, totalShares }
  // null account 用 '' 作為 key，自成一組
  const runningMap: Record<string, Record<string, { totalCost: number; totalShares: number }>> = {}
  const sellWaccMap: Record<number, number> = {}

  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    const acct = h.account ?? ''

    if (!runningMap[acct]) runningMap[acct] = {}
    if (!runningMap[acct][code]) runningMap[acct][code] = { totalCost: 0, totalShares: 0 }

    if (h.shares > 0) {
      runningMap[acct][code].totalCost += Number(h.average_cost) * h.shares
      runningMap[acct][code].totalShares += h.shares
    } else {
      const { totalCost, totalShares } = runningMap[acct][code]
      const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
      sellWaccMap[h.id] = wacc
      const absShares = Math.abs(h.shares)
      runningMap[acct][code].totalCost = Math.max(0, totalCost - wacc * absShares)
      runningMap[acct][code].totalShares = Math.max(0, totalShares - absShares)
    }
  }

  // 收集所有有淨持股的代號，用於抓現價
  const codesWithShares = new Set<string>()
  for (const codeMap of Object.values(runningMap)) {
    for (const [code, { totalShares }] of Object.entries(codeMap)) {
      if (totalShares > 0) codesWithShares.add(code)
    }
  }

  const priceInfos = await fetchPricesWithChange([...codesWithShares])
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
      createdAt: h.created_at,
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

  // 總成本／市值：跨帳戶加總（每帳戶各自 WACC × 淨持股）
  let totalCost = 0
  let totalValue = 0
  let totalPrevValue = 0
  for (const codeMap of Object.values(runningMap)) {
    for (const [code, { totalCost: cost, totalShares: shares }] of Object.entries(codeMap)) {
      if (shares <= 0) continue
      const wacc = cost / shares
      const info = priceInfos[code]
      totalCost += wacc * shares
      totalValue += info?.price ? info.price * shares : wacc * shares
      totalPrevValue += info?.prevClose ? info.prevClose * shares : (info?.price ?? wacc) * shares
    }
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
  const totalRealizedProfit = items.filter(i => i.isRealized).reduce((s, i) => s + i.profit, 0)

  // 按代號加總淨持股（跨帳戶合併，使用 WACC-based cost）
  const byCodeMap: Record<string, { stockCode: string; stockName: string; shares: number; cost: number; value: number; profit: number; dailyChangePct: number | null }> = {}
  for (const codeMap of Object.values(runningMap)) {
    for (const [code, { totalCost: cost, totalShares: shares }] of Object.entries(codeMap)) {
      if (shares <= 0) continue
      const wacc = cost / shares
      const info = priceInfos[code]
      const price = info?.price ?? wacc
      const value = Math.round(price * shares)
      const costRounded = Math.round(wacc * shares)
      if (!byCodeMap[code]) {
        const sample = items.find(i => i.stockCode.toUpperCase() === code)
        byCodeMap[code] = { stockCode: code, stockName: sample?.stockName ?? code, shares: 0, cost: 0, value: 0, profit: 0, dailyChangePct: info?.changePct ?? null }
      }
      byCodeMap[code].shares += shares
      byCodeMap[code].cost += costRounded
      byCodeMap[code].value += value
      byCodeMap[code].profit += value - costRounded
    }
  }
  const byCode = Object.values(byCodeMap)

  return {
    items,
    byCode,
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
