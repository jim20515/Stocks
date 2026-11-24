// 各帳號持股明細：依 portfolio_accounts 的自訂順序分組，
// 每個帳號內再依 stock_code 彙總（淨股數、該帳號移動加權平均成本、市值、損益、帳號內佔比、Beta 貢獻）。
// 成本計算統一走 server/utils/costBasis.ts，與持股管理一致。
// 與 beta-summary（跨帳號彙總）互不影響。

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date').order('id'),
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

  // 依帳戶各自計算 WACC
  const { ledger } = computeCostBasis(rows)
  const codes = ledger.openCodes()
  const prices: Record<string, number> = codes.length ? await fetchPrices(codes) : {}

  // 股名與持股類型（槓桿倍數：以該帳號的淨股數加權）
  const nameByCode: Record<string, string> = {}
  const levByAcct: Record<string, Record<string, { lev: number; net: number }>> = {}
  for (const h of rows) {
    const code = String(h.stock_code).toUpperCase()
    nameByCode[code] ??= h.stock_name
    const accName = accountKey(h.account) || UNASSIGNED
    levByAcct[accName] ??= {}
    const e = (levByAcct[accName][code] ??= { lev: 0, net: 0 })
    e.lev += Number(h.shares) * Number(h.leverage_multiplier ?? 1)
    e.net += Number(h.shares)
  }

  // 帳號 → 股票 持倉
  const groups: Record<string, Record<string, { stockCode: string; stockName: string; shares: number; totalCost: number; leverage: number }>> = {}
  for (const p of ledger.open()) {
    const accName = p.account || UNASSIGNED
    groups[accName] ??= {}
    groups[accName][p.code] = {
      stockCode: p.code,
      stockName: nameByCode[p.code] ?? p.code,
      shares: p.totalShares,
      totalCost: p.totalCost,
      leverage: (() => {
        const e = levByAcct[accName]?.[p.code]
        return e && e.net > 0 ? e.lev / e.net : 1
      })(),
    }
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
      .map((it) => {
        const price = prices[it.stockCode] ?? null
        const avgCost = it.totalCost / it.shares
        const effPrice = price ?? avgCost
        const marketValue = Math.round(effPrice * it.shares)
        const totalCost = Math.round(it.totalCost)
        const profit = marketValue - totalCost
        const leverage = it.leverage
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
