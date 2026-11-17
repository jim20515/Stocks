// 各帳號持股明細：依 portfolio_accounts 的自訂順序分組，
// 每個帳號內再依 stock_code 彙總（淨股數、加權均成本、市值、損益、帳號內佔比、Beta 貢獻）。
// 與 beta-summary（跨帳號彙總）互不影響。

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('stock_code'),
    client.from('portfolio_accounts').select('id, name, sort_order, created_at').eq('user_id', userId),
  ])

  const rows: any[] = holdings ?? []
  const UNASSIGNED = '未指定'

  // 帳號自訂順序（sort_order 未建立時退化為建立時間）
  const accRows = (accounts ?? []).slice().sort((a: any, b: any) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
  const accIndex = new Map<string, number>()
  accRows.forEach((a: any, i: number) => accIndex.set(String(a.name).trim(), i))

  // 各股票整體淨股數，決定哪些股票仍在持有（口徑與主表一致）
  const netByCode: Record<string, number> = {}
  for (const h of rows) {
    const code = String(h.stock_code).toUpperCase()
    netByCode[code] = (netByCode[code] ?? 0) + Number(h.shares)
  }
  const codes = Object.keys(netByCode).filter(c => netByCode[c] > 0)
  const prices: Record<string, number> = codes.length ? await fetchPrices(codes) : {}

  // 帳號 → 股票 彙總
  interface AccItem {
    stockCode: string
    stockName: string
    shares: number
    totalBuyCost: number
    totalBuyShares: number
    levWeighted: number
  }
  const groups: Record<string, Record<string, AccItem>> = {}

  for (const h of rows) {
    const code = String(h.stock_code).toUpperCase()
    if ((netByCode[code] ?? 0) <= 0) continue
    const accName = (h.account && String(h.account).trim()) || UNASSIGNED
    if (!groups[accName]) groups[accName] = {}
    const g = groups[accName]
    if (!g[code]) {
      g[code] = { stockCode: code, stockName: h.stock_name, shares: 0, totalBuyCost: 0, totalBuyShares: 0, levWeighted: 0 }
    }
    const it = g[code]
    const sh = Number(h.shares)
    it.shares += sh
    if (sh > 0) {
      it.totalBuyCost += Number(h.average_cost) * sh
      it.totalBuyShares += sh
    }
    it.levWeighted += sh * Number(h.leverage_multiplier ?? 1)
  }

  // 帳號排序：自訂清單內 → 清單外（名稱）→ 未指定
  const inList: string[] = []
  const notInList: string[] = []
  let hasUnassigned = false
  for (const name of Object.keys(groups)) {
    if (name === UNASSIGNED) { hasUnassigned = true; continue }
    if (accIndex.has(name)) inList.push(name)
    else notInList.push(name)
  }
  inList.sort((a, b) => (accIndex.get(a)! - accIndex.get(b)!))
  notInList.sort((a, b) => a.localeCompare(b, 'zh-TW'))
  const orderedNames = [...inList, ...notInList, ...(hasUnassigned ? [UNASSIGNED] : [])]

  const accountsOut = orderedNames.map((name) => {
    const g = groups[name]
    const items = Object.values(g)
      .filter(it => it.shares > 0)
      .map((it) => {
        const price = prices[it.stockCode] ?? null
        const avgCost = it.totalBuyShares > 0 ? it.totalBuyCost / it.totalBuyShares : 0
        const effPrice = price ?? avgCost
        const marketValue = Math.round(effPrice * it.shares)
        const totalCost = Math.round(avgCost * it.shares)
        const profit = marketValue - totalCost
        const leverage = it.shares > 0 ? it.levWeighted / it.shares : 1
        return {
          stockCode: it.stockCode,
          stockName: it.stockName,
          shares: it.shares,
          currentPrice: price,
          avgCost: Math.round(avgCost * 100) / 100,
          marketValue,
          totalCost,
          profit,
          profitPct: totalCost > 0 ? Math.round((profit / totalCost) * 10000) / 100 : null,
          leverageMultiplier: Math.round(leverage * 100) / 100,
        }
      })
      .sort((a, b) => b.marketValue - a.marketValue)

    const accMV = items.reduce((s, i) => s + i.marketValue, 0)
    const accCost = items.reduce((s, i) => s + i.totalCost, 0)
    const accProfit = accMV - accCost

    const finalItems = items.map(i => ({
      ...i,
      accountShare: accMV > 0 ? Math.round((i.marketValue / accMV) * 1e6) / 1e6 : 0,
      betaContrib: accMV > 0 ? Math.round(((i.marketValue / accMV) * i.leverageMultiplier) * 1e6) / 1e6 : 0,
    }))

    return {
      account: name,
      items: finalItems,
      subtotal: {
        marketValue: accMV,
        cost: accCost,
        profit: accProfit,
        profitPct: accCost > 0 ? Math.round((accProfit / accCost) * 10000) / 100 : null,
        itemCount: finalItems.length,
      },
    }
  }).filter(a => a.items.length > 0)

  const totals = accountsOut.reduce((acc, a) => {
    acc.marketValue += a.subtotal.marketValue
    acc.cost += a.subtotal.cost
    acc.profit += a.subtotal.profit
    return acc
  }, { marketValue: 0, cost: 0, profit: 0 })

  return { accounts: accountsOut, totals }
})
