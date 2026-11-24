export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  // 取得所有持股
  const [{ data: holdings }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date').order('id'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  if (!holdings?.length) return { success: true, skipped: true }

  // 依帳戶各自計算 WACC（server/utils/costBasis.ts）
  const { ledger } = computeCostBasis(holdings)
  const priceInfos = await fetchPricesWithChange(ledger.openCodes())

  let totalValue = 0
  let totalPrevValue = 0
  for (const p of ledger.open()) {
    const info = priceInfos[p.code]
    const price = info?.price ?? p.totalCost / p.totalShares
    const prevClose = info?.prevClose ?? price
    totalValue += price * p.totalShares
    totalPrevValue += prevClose * p.totalShares
  }

  totalValue = Math.round(totalValue)
  const totalCost = Math.round(ledger.totalCost())

  // 今日買賣淨現金流（買入 + 成交金額、賣出 − 賣出金額），與排程快照／歷史重算一致
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const todayTrades = holdings.filter((h: any) => h.buy_date === today)
  const dailyTradeAmount = Math.round(tradeCashFlow(todayTrades))

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
