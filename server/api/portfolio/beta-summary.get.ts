
export default defineEventHandler(async (event) => {
  const client = useDb()

  const [{ data: settings }, { data: holdings }] = await Promise.all([
    client.from('portfolio_settings').select('*').eq('id', 1).single(),
    client.from('stock_holdings').select('*').order('stock_code'),
  ])

  const s = settings ?? { cash_amount: 0, target_beta: 1.46 }
  const codes = [...new Set((holdings ?? []).map(h => h.stock_code))]
  const prices = await fetchPrices(codes)

  const rows = (holdings ?? []).map(h => {
    const price = prices[h.stock_code.toUpperCase()] ?? null
    const marketValue = price ? price * h.shares : Number(h.average_cost) * h.shares
    return { ...h, currentPrice: price, marketValue }
  })

  const totalValue = rows.reduce((s, r) => s + r.marketValue, 0) + Number(s.cash_amount)

  const items = rows.map(r => {
    const allocation = totalValue > 0 ? r.marketValue / totalValue : 0
    const betaContrib = allocation * Number(r.leverage_multiplier)
    return {
      id: r.id,
      stockCode: r.stock_code,
      stockName: r.stock_name,
      shares: r.shares,
      averageCost: Number(r.average_cost),
      leverageMultiplier: Number(r.leverage_multiplier),
      currentPrice: r.currentPrice,
      marketValue: Math.round(r.marketValue),
      allocation: Math.round(allocation * 1e6) / 1e6,
      betaContrib: Math.round(betaContrib * 1e6) / 1e6,
    }
  })

  const cashAlloc = totalValue > 0 ? Number(s.cash_amount) / totalValue : 0
  const currentBeta = items.reduce((s, i) => s + i.betaContrib, 0)
  const target1x = Number((s as any).target_alloc_1x ?? 70)
  const target2x = Number((s as any).target_alloc_2x ?? 20)
  // targetBeta 由目標配置自動計算：(1x% × 1) + (2x% × 2)
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
