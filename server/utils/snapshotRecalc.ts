import { fetchPricesWithChange } from './stockPrice'

interface TwseDayResp {
  stat?: string
  title?: string
  data?: string[][]
}

/** 從 TWSE 月報抓取指定代號與日期的收盤價 */
async function fetchTwseClosePrice(code: string, dateStr: string): Promise<number | null> {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const queryDate = `${y}${m}01`
  const twDate = `${parseInt(y, 10) - 1911}/${m}/${d}`

  try {
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${queryDate}&stockNo=${code}`
    const resp = await $fetch<TwseDayResp>(url)
    if (resp?.stat === 'OK' && resp.data?.length) {
      const row = resp.data.find(r => r[0] === twDate)
      if (row && row[6]) {
        const p = parseFloat(row[6].replace(/,/g, ''))
        return isNaN(p) ? null : p
      }
    }
  } catch {}
  return null
}

/** 取得歷史指定日期的收盤價（優先讀 DB，若無則打 TWSE / Yahoo 備援） */
export async function getHistoricalClosePrice(client: any, code: string, dateStr: string): Promise<number | null> {
  const normalizedCode = code.toUpperCase()

  // 1. 先查資料庫 stock_daily_prices
  try {
    const { data } = await client
      .from('stock_daily_prices')
      .select('close_price')
      .eq('stock_code', normalizedCode)
      .eq('date', dateStr)
      .maybeSingle()

    if (data?.close_price != null) {
      const p = Number(data.close_price)
      if (Number.isFinite(p) && p > 0) return p
    }
  } catch {}

  // 2. TWSE 個股月報
  const twsePrice = await fetchTwseClosePrice(normalizedCode, dateStr)
  if (twsePrice != null && twsePrice > 0) {
    // 寫入 DB 快取，方便後續查詢
    try {
      await client.from('stock_daily_prices').upsert({
        stock_code: normalizedCode,
        date: dateStr,
        close_price: twsePrice,
      }, { onConflict: 'stock_code,date' })
    } catch {}
    return twsePrice
  }

  // 3. Yahoo Finance 歷史日線備援
  try {
    for (const suffix of ['TW', 'TWO']) {
      const data = await $fetch<any>(
        `https://query2.finance.yahoo.com/v8/finance/chart/${normalizedCode}.${suffix}?interval=1d&range=1mo`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      const timestamps = data?.chart?.result?.[0]?.timestamp || []
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []
      for (let i = 0; i < timestamps.length; i++) {
        const dStr = new Date(timestamps[i] * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
        if (dStr === dateStr && closes[i] > 0) {
          const p = Math.round(closes[i] * 100) / 100
          try {
            await client.from('stock_daily_prices').upsert({
              stock_code: normalizedCode,
              date: dateStr,
              close_price: p,
            }, { onConflict: 'stock_code,date' })
          } catch {}
          return p
        }
      }
    }
  } catch {}

  return null
}

export interface SavedSnapshotItem {
  date: string
  total_value: number
  total_cost: number
  daily_change: number | null
  daily_change_pct: number | null
  daily_trade_amount: number | null
}

/**
 * 重新計算指定用戶從 fromDate 起至今的所有每日快照
 * 回傳受影響的快照數量與原始備份資料（供 revert 還原使用）
 */
export async function recalculateSnapshots(
  client: any,
  userId: string,
  fromDate: string
): Promise<{ updatedCount: number; savedSnapshots: SavedSnapshotItem[] }> {
  // 1. 取得需要校正的快照清單
  const { data: snaps, error: sErr } = await client
    .from('portfolio_daily_snapshot')
    .select('date, total_value, total_cost, daily_change, daily_change_pct, daily_trade_amount')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .order('date', { ascending: true })

  if (sErr || !snaps?.length) {
    return { updatedCount: 0, savedSnapshots: [] }
  }

  const savedSnapshots: SavedSnapshotItem[] = snaps.map((s: any) => ({
    date: s.date,
    total_value: Number(s.total_value),
    total_cost: Number(s.total_cost || 0),
    daily_change: s.daily_change != null ? Number(s.daily_change) : null,
    daily_change_pct: s.daily_change_pct != null ? Number(s.daily_change_pct) : null,
    daily_trade_amount: s.daily_trade_amount != null ? Number(s.daily_trade_amount) : null,
  }))

  // 2. 取該用戶所有持股單據（依日期排序）
  const { data: allHoldings } = await client
    .from('stock_holdings')
    .select('*')
    .eq('user_id', userId)
    .order('buy_date', { ascending: true })
    .order('id', { ascending: true })

  const holdingsList: any[] = allHoldings || []
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

  // 3. 逐日重算
  for (const snap of snaps) {
    const d = snap.date
    const subHoldings = holdingsList.filter(h => h.buy_date <= d)

    // 按帳戶分組計算 WACC（與 summary / snapshot.post API 相同邏輯）
    const runningMap: Record<string, Record<string, { totalCost: number; totalShares: number }>> = {}
    for (const h of subHoldings) {
      const code = h.stock_code.toUpperCase()
      const acct = h.account ?? ''
      if (!runningMap[acct]) runningMap[acct] = {}
      if (!runningMap[acct][code]) runningMap[acct][code] = { totalCost: 0, totalShares: 0 }
      if (h.shares > 0) {
        runningMap[acct][code].totalCost += Number(h.average_cost) * h.shares
        runningMap[acct][code].totalShares += h.shares
      } else {
        const { totalCost, totalShares } = runningMap[acct][code]
        const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
        const abs = Math.abs(h.shares)
        runningMap[acct][code].totalCost = Math.max(0, totalCost - wacc * abs)
        runningMap[acct][code].totalShares = Math.max(0, totalShares - abs)
      }
    }

    // 收集所有有淨持股的代號
    const activeCodesSet = new Set<string>()
    for (const codeMap of Object.values(runningMap)) {
      for (const [code, { totalShares }] of Object.entries(codeMap)) {
        if (totalShares > 0) activeCodesSet.add(code)
      }
    }
    const activeCodes = [...activeCodesSet]
    if (!activeCodes.length) continue

    // 取得當日價格
    let prices: Record<string, number> = {}

    if (d === todayStr) {
      const infos = await fetchPricesWithChange(activeCodes)
      for (const c of activeCodes) {
        prices[c] = infos[c]?.price ?? 0
      }
    } else {
      for (const c of activeCodes) {
        const p = await getHistoricalClosePrice(client, c, d)
        prices[c] = p ?? 0
      }
    }

    let totalValue = 0
    let totalCost = 0
    for (const codeMap of Object.values(runningMap)) {
      for (const [code, { totalCost: cost, totalShares: shares }] of Object.entries(codeMap)) {
        if (shares <= 0) continue
        const wacc = cost / shares
        const price = (prices[code] && prices[code] > 0) ? prices[code] : wacc
        totalValue += price * shares
        totalCost += wacc * shares
      }
    }

    totalValue = Math.round(totalValue)
    totalCost = Math.round(totalCost)

    // 當日買賣交易額
    const todayTrades = subHoldings.filter(h => h.buy_date === d)
    const dailyTradeAmount = Math.round(todayTrades.reduce((s, h) => s + Number(h.shares) * Number(h.average_cost), 0))
    let tradeMarketImpact = 0
    for (const h of todayTrades) {
      tradeMarketImpact += Number(h.shares) * Number(h.average_cost)
    }

    // 取前一交易日快照數值
    const { data: prevSnapArr } = await client
      .from('portfolio_daily_snapshot')
      .select('total_value')
      .eq('user_id', userId)
      .lt('date', d)
      .order('date', { ascending: false })
      .limit(1)

    const prevValue = prevSnapArr?.[0]?.total_value != null ? Number(prevSnapArr[0].total_value) : null
    const pureDailyChange = prevValue != null ? Math.round(totalValue - prevValue - tradeMarketImpact) : 0
    const dailyChangePct = (prevValue != null && prevValue > 0)
      ? Math.round(pureDailyChange / prevValue * 10000) / 100
      : null

    // 更新快照
    await client
      .from('portfolio_daily_snapshot')
      .update({
        total_value: totalValue,
        total_cost: totalCost,
        daily_trade_amount: dailyTradeAmount,
        daily_change: pureDailyChange,
        daily_change_pct: dailyChangePct,
      })
      .eq('user_id', userId)
      .eq('date', d)
  }

  return { updatedCount: snaps.length, savedSnapshots }
}

/** 還原快照資料 */
export async function restoreSnapshots(client: any, userId: string, savedSnapshots: SavedSnapshotItem[]): Promise<void> {
  if (!savedSnapshots?.length) return
  for (const s of savedSnapshots) {
    await client
      .from('portfolio_daily_snapshot')
      .update({
        total_value: s.total_value,
        total_cost: s.total_cost,
        daily_trade_amount: s.daily_trade_amount,
        daily_change: s.daily_change,
        daily_change_pct: s.daily_change_pct,
      })
      .eq('user_id', userId)
      .eq('date', s.date)
  }
}
