export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  // 取得所有持股
  const [{ data: holdings }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  if (!holdings?.length) return { success: true, skipped: true }

  // 按帳戶分組計算 WACC（與 summary API 相同邏輯）
  const runningMap: Record<string, Record<string, { totalCost: number; totalShares: number }>> = {}
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
      const abs = Math.abs(h.shares)
      runningMap[acct][code].totalCost = Math.max(0, totalCost - wacc * abs)
      runningMap[acct][code].totalShares = Math.max(0, totalShares - abs)
    }
  }

  // 收集所有有淨持股的代號
  const codesWithShares = new Set<string>()
  for (const codeMap of Object.values(runningMap)) {
    for (const [code, { totalShares }] of Object.entries(codeMap)) {
      if (totalShares > 0) codesWithShares.add(code)
    }
  }

  const priceInfos = await fetchPricesWithChange([...codesWithShares])

  let totalValue = 0
  let totalPrevValue = 0
  let totalCost = 0
  for (const codeMap of Object.values(runningMap)) {
    for (const [code, { totalCost: cost, totalShares: shares }] of Object.entries(codeMap)) {
      if (shares <= 0) continue
      const wacc = cost / shares
      const info = priceInfos[code]
      const price = info?.price ?? wacc
      const prevClose = info?.prevClose ?? price
      totalValue += price * shares
      totalPrevValue += prevClose * shares
      totalCost += wacc * shares
    }
  }

  totalValue = Math.round(totalValue)
  totalCost = Math.round(totalCost)

  // 今日買賣金額
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const todayTrades = holdings.filter((h: any) => h.buy_date === today)
  const dailyTradeAmount = Math.round(todayTrades.reduce((s: number, h: any) => {
    if (h.shares > 0) return s + h.shares * Number(h.average_cost)
    const code = h.stock_code.toUpperCase()
    const acct = h.account ?? ''
    const entry = runningMap[acct]?.[code]
    const wacc = entry?.totalShares > 0 ? entry.totalCost / entry.totalShares : Number(h.average_cost)
    return s + h.shares * wacc
  }, 0))

  const dailyChange = Math.round(totalValue - totalPrevValue - dailyTradeAmount)
  const dailyChangePct = totalPrevValue > 0
    ? Math.round(dailyChange / totalPrevValue * 10000) / 100
    : null

  const { error } = await client
    .from('portfolio_daily_snapshot')
    .upsert({
      user_id: userId,
      date: today,
      total_value: totalValue,
      total_cost: totalCost,
      daily_trade_amount: dailyTradeAmount,
      daily_change: dailyChange,
      daily_change_pct: dailyChangePct,
    }, { onConflict: 'user_id,date' })

  if (error) throw createError({ statusCode: 500, message: error.message })

  return { success: true, date: today, totalValue, dailyChange, dailyChangePct }
})
