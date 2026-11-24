export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  // Supabase max-rows = 1000：交易紀錄分頁抓完，避免漏算賣出
  async function fetchAllHoldings() {
    const PAGE = 1000
    const all: any[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('stock_holdings')
        .select('id, stock_code, shares, average_cost, account, buy_date')
        .eq('user_id', userId)
        .order('buy_date').order('id')
        .range(from, from + PAGE - 1)
      if (error) return { data: null, error }
      all.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return { data: all, error: null }
  }

  const [{ data, error }, { data: holdings, error: hErr }] = await Promise.all([
    client
      .from('portfolio_daily_snapshot')
      .select('date, total_value, total_cost, daily_trade_amount')
      .eq('user_id', userId)
      .order('date', { ascending: false }),
    fetchAllHoldings(),
  ])

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (hErr) throw createError({ statusCode: 500, message: hErr.message })

  // 已實現損益（帳戶別 WACC，server/utils/costBasis.ts）依賣出日加總，
  // 每筆快照附上「截至當日（含）」的累積已實現損益，供每日漲幅頁算累積獲利。
  const { sells } = computeCostBasis(holdings ?? [])
  const sellDate = new Map<number, string>()
  for (const h of holdings ?? []) sellDate.set(Number(h.id), String(h.buy_date ?? ''))
  const realizedByDate = new Map<string, number>()
  for (const [id, info] of sells) {
    const d = sellDate.get(id) ?? ''
    realizedByDate.set(d, (realizedByDate.get(d) ?? 0) + Math.round(info.realized))
  }
  const realizedDates = [...realizedByDate.keys()].sort()

  const rows = data ?? []
  // rows 由新到舊；由舊到新逐日累加
  let cum = 0
  let j = 0
  const out = new Array(rows.length)
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    const date = String(row.date)
    while (j < realizedDates.length && realizedDates[j] <= date) {
      cum += realizedByDate.get(realizedDates[j])!
      j++
    }
    out[i] = { ...row, cum_realized: cum }
  }
  return out
})
