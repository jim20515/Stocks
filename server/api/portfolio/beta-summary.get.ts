
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
  const targetBeta = Number(s.target_beta)

  return {
    items,
    cash: { amount: Number(s.cash_amount), allocation: Math.round(cashAlloc * 1e6) / 1e6 },
    totalValue: Math.round(totalValue),
    currentBeta: Math.round(currentBeta * 1e4) / 1e4,
    targetBeta,
    betaDiff: Math.round((currentBeta - targetBeta) * 1e4) / 1e4,
  }
})
