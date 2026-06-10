
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: settings }, { data: holdings }] = await Promise.all([
    client.from('portfolio_settings').select('*').eq('user_id', userId).single(),
    client.from('stock_holdings').select('*').eq('user_id', userId).order('stock_code'),
  ])

  const s = settings ?? { cash_amount: 0, target_beta: 1.46 }

  // 軋出每檔股票的淨持股與 WACC
  const netMap: Record<string, { netShares: number; totalBuyCost: number; totalBuyShares: number; stockName: string; leverageMultiplier: number; lastId: number }> = {}
  for (const h of (holdings ?? [])) {
    const code = h.stock_code.toUpperCase()
    if (!netMap[code]) netMap[code] = { netShares: 0, totalBuyCost: 0, totalBuyShares: 0, stockName: h.stock_name, leverageMultiplier: Number(h.leverage_multiplier), lastId: h.id }
    netMap[code].netShares += h.shares
    if (h.shares > 0) {
      netMap[code].totalBuyCost += Number(h.average_cost) * h.shares
      netMap[code].totalBuyShares += h.shares
    }
    netMap[code].lastId = h.id
  }

  // 只保留淨持股 > 0 的股票
  const codes = Object.keys(netMap).filter(c => netMap[c].netShares > 0)
  const prices = await fetchPrices(codes)

  const totalValue = codes.reduce((sum, code) => {
    const { netShares, totalBuyCost, totalBuyShares } = netMap[code]
    const wacc = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const price = prices[code] ?? wacc
    return sum + price * netShares
  }, 0) + Number(s.cash_amount)

  const items = codes.map(code => {
    const { netShares, totalBuyCost, totalBuyShares, stockName, leverageMultiplier, lastId } = netMap[code]
    const wacc = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const price = prices[code] ?? null
    const marketValue = (price ?? wacc) * netShares
    const allocation = totalValue > 0 ? marketValue / totalValue : 0
    const betaContrib = allocation * leverageMultiplier
    return {
      id: lastId,
      stockCode: code,
      stockName,
      shares: netShares,
      averageCost: Math.round(wacc * 100) / 100,
      leverageMultiplier,
      currentPrice: price,
      marketValue: Math.round(marketValue),
      allocation: Math.round(allocation * 1e6) / 1e6,
      betaContrib: Math.round(betaContrib * 1e6) / 1e6,
    }
  })

  const cashAlloc = totalValue > 0 ? Number(s.cash_amount) / totalValue : 0
  const currentBeta = items.reduce((s, i) => s + i.betaContrib, 0)
  const target1x = Number((s as any).target_alloc_1x ?? 70)
  const target2x = Number((s as any).target_alloc_2x ?? 20)
  const targetBeta = Math.round((target1x / 100 * 1 + target2x / 100 * 2) * 1e4) / 1e4
  const target0x = Math.max(0, 100 - target1x - target2x)

  const actual1x = totalValue > 0
    ? items.filter(i => i.leverageMultiplier === 1).reduce((a, i) => a + i.marketValue, 0) / totalValue * 100 : 0
  const actual2x = totalValue > 0
    ? items.filter(i => i.leverageMultiplier === 2).reduce((a, i) => a + i.marketValue, 0) / totalValue * 100 : 0
  const actual0x = totalValue > 0
    ? (items.filter(i => i.leverageMultiplier === 0).reduce((a, i) => a + i.marketValue, 0) + Number(s.cash_amount)) / totalValue * 100 : 0

  return {
    items,
    cash: { amount: Number(s.cash_amount), allocation: Math.round(cashAlloc * 1e6) / 1e6 },
    totalValue: Math.round(totalValue),
    currentBeta: Math.round(currentBeta * 1e4) / 1e4,
    targetBeta,
    betaDiff: Math.round((currentBeta - targetBeta) * 1e4) / 1e4,
    targetAlloc: { x1: target1x, x2: target2x, x0: target0x },
    actualAlloc: {
      x1: Math.round(actual1x * 100) / 100,
      x2: Math.round(actual2x * 100) / 100,
      x0: Math.round(actual0x * 100) / 100,
    },
  }
})
