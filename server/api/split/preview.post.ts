import { normalizeStockCode, normalizeDate, finiteNumber } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const body = await readBody(event)
  const { stockCode, splitDate, resumeDate, ratio, adjustDailyPrices } = body ?? {}

  const code = normalizeStockCode(stockCode)
  const sDate = normalizeDate(splitDate, '分割基準日')
  const rDate = resumeDate ? normalizeDate(resumeDate, '新股恢復交易日') : null
  const r = finiteNumber(ratio, '分割倍數', 0.01, 1000)

  // 查詢目前使用者符合條件的持股
  const { data: holdings, error } = await client
    .from('stock_holdings')
    .select('id, stock_code, stock_name, shares, average_cost, buy_date, account')
    .eq('user_id', userId)
    .eq('stock_code', code)
    .lte('buy_date', sDate)
    .order('buy_date')

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  const holdingsList = holdings || []
  const stockName = holdingsList[0]?.stock_name || code

  let currentShares = 0
  let newShares = 0
  let currentCost = 0

  const sampleHoldings = holdingsList.slice(0, 5).map((h: any) => {
    const origShares = h.shares
    const origCost = Number(h.average_cost)
    const afterShares = Math.round(origShares * r)
    const afterCost = Math.round((origCost / r) * 100) / 100
    return {
      id: h.id,
      account: h.account,
      buyDate: h.buy_date,
      origShares,
      afterShares,
      origCost,
      afterCost,
    }
  })

  for (const h of holdingsList) {
    const s = h.shares
    const c = Number(h.average_cost)
    currentShares += s
    newShares += Math.round(s * r)
    currentCost += s * c
  }

  const newAverageCostPreview = newShares > 0 ? Math.round((currentCost / newShares) * 100) / 100 : 0

  let dailyPricesCount = 0
  if (adjustDailyPrices !== false) {
    const { count } = await client
      .from('stock_daily_prices')
      .select('date', { count: 'exact', head: true })
      .eq('stock_code', code)
      .lte('date', sDate)

    dailyPricesCount = count || 0
  }

  // 試算受影響的每日快照筆數（從恢復交易日或基準日起）
  const effectiveResumeDate = rDate || sDate
  const { count: snapshotsCount } = await client
    .from('portfolio_daily_snapshot')
    .select('date', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', effectiveResumeDate)

  return {
    ok: true,
    stockCode: code,
    stockName,
    splitDate: sDate,
    resumeDate: rDate,
    ratio: r,
    holdingsCount: holdingsList.length,
    currentShares,
    newShares,
    currentCost: Math.round(currentCost),
    newAverageCostPreview,
    dailyPricesCount,
    snapshotsCount: snapshotsCount || 0,
    sampleHoldings,
  }
})
