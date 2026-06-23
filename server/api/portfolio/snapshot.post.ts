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

  // 計算 WACC（與 summary API 相同邏輯）
  const runningMap: Record<string, { totalCost: number; totalShares: number }> = {}
  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    if (!runningMap[code]) runningMap[code] = { totalCost: 0, totalShares: 0 }
    if (h.shares > 0) {
      runningMap[code].totalCost += Number(h.average_cost) * h.shares
      runningMap[code].totalShares += h.shares
    } else {
      const { totalCost, totalShares } = runningMap[code]
      const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
      const abs = Math.abs(h.shares)
      runningMap[code].totalCost = Math.max(0, totalCost - wacc * abs)
      runningMap[code].totalShares = Math.max(0, totalShares - abs)
    }
  }

  // 淨持股
  const netSharesMap: Record<string, number> = {}
  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    netSharesMap[code] = (netSharesMap[code] ?? 0) + h.shares
  }

  const codes = Object.keys(netSharesMap).filter(c => netSharesMap[c] > 0)
  const priceInfos = await fetchPricesWithChange(codes)

  let totalValue = 0
  let totalPrevValue = 0
  let totalCost = 0
  for (const code of codes) {
    const netShares = netSharesMap[code]
    const info = priceInfos[code]
    const wacc = runningMap[code]?.totalShares > 0
      ? runningMap[code].totalCost / runningMap[code].totalShares : 0
    const price = info?.price ?? wacc
    const prevClose = info?.prevClose ?? price
    totalValue += price * netShares
    totalPrevValue += prevClose * netShares
    totalCost += wacc * netShares
  }

  totalValue = Math.round(totalValue)
  totalCost = Math.round(totalCost)

  // 今日買賣金額
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const todayTrades = holdings.filter((h: any) => h.buy_date === today)
  const dailyTradeAmount = Math.round(todayTrades.reduce((s: number, h: any) => {
    if (h.shares > 0) return s + h.shares * Number(h.average_cost)
    const code = h.stock_code.toUpperCase()
    const wacc = runningMap[code]?.totalShares > 0
      ? runningMap[code].totalCost / runningMap[code].totalShares : Number(h.average_cost)
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
