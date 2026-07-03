export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const query = getQuery(event)

  // 篩選條件皆為選填：code / account / 區間
  const codeRaw = String(query.code ?? '').trim()
  const code = codeRaw ? normalizeStockCode(codeRaw) : null
  const account = String(query.account ?? '').trim() || null
  const startDate = query.startDate ? normalizeDate(query.startDate, '起始日期') : null
  const endDate = query.endDate ? normalizeDate(query.endDate, '結束日期') : null
  const includeFee = query.includeFee !== 'false'

  let q = client
    .from('stock_holdings')
    .select('id, stock_code, stock_name, shares, average_cost, buy_date, account')
    .eq('user_id', userId)

  if (code) q = q.eq('stock_code', code)
  if (account) q = q.eq('account', account)
  if (startDate) q = q.gte('buy_date', startDate)
  if (endDate) q = q.lte('buy_date', endDate)

  const { data: holdings, error } = await q.order('buy_date').order('id')
  if (error) throw createError({ statusCode: 500, message: error.message })

  if (!holdings?.length) {
    return {
      pairs: [], openLots: [], totalCost: 0, realizedProfit: 0, unrealizedProfit: 0,
      totalProfit: 0, returnPct: null, buyCount: 0, sellCount: 0, pairCount: 0, winCount: 0,
      remainingShares: 0, matchedCount: 0, priceDate: null,
    }
  }

  // 取涉及代號的即時價（算未實現損益用）
  const codes = [...new Set(holdings.map(h => h.stock_code.toUpperCase()))]
  const priceInfos = await fetchPricesWithChange(codes)
  const priceMap: Record<string, number> = {}
  for (const [c, info] of Object.entries(priceInfos)) priceMap[c] = info.price

  const result = computeLifoResult(holdings as any, priceMap, includeFee)

  // 補上股名（供前端顯示）
  const nameMap: Record<string, string> = {}
  for (const h of holdings) nameMap[h.stock_code.toUpperCase()] = h.stock_name
  const pairs = result.pairs.map(p => ({ ...p, name: nameMap[p.code] ?? p.code }))
  const openLots = result.openLots.map(l => ({ ...l, name: nameMap[l.code] ?? l.code }))

  return {
    ...result,
    pairs,
    openLots,
    matchedCount: holdings.length,
    priceDate: new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
  }
})
