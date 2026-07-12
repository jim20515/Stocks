export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)
  const { year, month } = body as { year: number; month: number }

  if (!year || !month) throw createError({ statusCode: 400, message: '缺少 year / month 參數' })

  const { data: holdings } = await client
    .from('stock_holdings').select('*').eq('user_id', userId).order('buy_date')

  if (!holdings?.length) return { success: true, pricesInserted: 0, snapshotsInserted: 0, tradingDays: 0 }

  // 清除「第一筆交易日之前」的殘留快照：那時尚未有任何部位，這種列一定是舊版匯入留下的幽靈資料。
  // 若不清掉，它會被當成第一個交易日的「昨日」，導致隔日「當日漲跌」錯誤地扣掉不存在的前一日市值。
  const firstBuyDate = holdings[0].buy_date
  if (firstBuyDate) {
    await client.from('portfolio_daily_snapshot')
      .delete().eq('user_id', userId).lt('date', firstBuyDate)
  }

  const mm = String(month).padStart(2, '0')
  const monthStart = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  const dateStr = `${year}${mm}01`
  const activeCodes = [...new Set(holdings.map(h => h.stock_code.toUpperCase()))]
    .filter((code) => {
      const rows = holdings.filter(h => h.stock_code.toUpperCase() === code)
      const sharesBeforeMonth = rows
        .filter(h => h.buy_date < monthStart)
        .reduce((sum, h) => sum + Number(h.shares), 0)
      const hasTradeInMonth = rows.some(h => h.buy_date >= monthStart && h.buy_date <= monthEnd)

      return sharesBeforeMonth > 0 || hasTradeInMonth
    })

  if (!activeCodes.length) {
    return {
      success: true,
      pricesInserted: 0,
      snapshotsInserted: 0,
      tradingDays: 0,
      debug: [`${year}-${mm}: 無持股或交易，略過`],
    }
  }

  let pricesInserted = 0
  const debugLog: string[] = []
  // 直接在記憶體中建 dayMap，不在 INSERT 後再 SELECT
  const dayMap: Record<string, Record<string, number>> = {}
  const priorPriceMap: Record<string, number> = {}

  for (const code of activeCodes) {
    // 先載入 DB 既有資料；後續仍會重新抓當月資料補齊，避免「只有部分資料卻整月跳過」。
    const { data: existing } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
      .gte('date', monthStart)
      .lte('date', monthEnd)

    if (existing?.length) {
      debugLog.push(`${code}: DB已有${existing.length}筆，將重新抓取補齊`)
      for (const row of existing) {
        if (!dayMap[row.date]) dayMap[row.date] = {}
        dayMap[row.date][code] = Number(row.close_price)
      }
    }

    // 月初前最後一筆價格，給月初或個別交易日缺價時沿用，避免少算該檔市值。
    const { data: priorPriceArr } = await client
      .from('stock_daily_prices')
      .select('close_price')
      .eq('stock_code', code)
      .lt('date', monthStart)
      .order('date', { ascending: false })
      .limit(1)
    if (priorPriceArr?.[0]?.close_price != null) {
      priorPriceMap[code] = Number(priorPriceArr[0].close_price)
    }

    // TWSE
    let fetched = false
    try {
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`
      const resp = await $fetch<any>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      })

      debugLog.push(`${code} TWSE stat=${resp?.stat} rows=${resp?.data?.length ?? 0}`)

      if (resp?.stat === 'OK' && resp.data?.length) {
        const toInsert: { stock_code: string; date: string; close_price: number }[] = []
        for (const row of resp.data) {
          const dateRaw = row[0] as string
          const close = parseFloat((row[6] as string).replace(/,/g, ''))
          if (isNaN(close) || close <= 0) continue
          const parts = dateRaw.split('/')
          if (parts.length < 3) continue
          const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          toInsert.push({ stock_code: code, date: isoDate, close_price: close })
        }
        if (toInsert.length) {
          const { error: upsertErr } = await client
            .from('stock_daily_prices')
            .upsert(toInsert, { onConflict: 'stock_code,date' })
          if (upsertErr) {
            debugLog.push(`${code} upsert失敗: ${upsertErr.message}`)
          } else {
            pricesInserted += toInsert.length
            fetched = true
            debugLog.push(`${code}: 寫入${toInsert.length}筆`)
            // 寫入記憶體 dayMap
            for (const r of toInsert) {
              if (!dayMap[r.date]) dayMap[r.date] = {}
              dayMap[r.date][code] = r.close_price
            }
          }
        }
      }
    } catch (e: any) {
      debugLog.push(`${code} TWSE例外: ${e?.message ?? e}`)
    }

    // OTC 備援
    if (!fetched) {
      try {
        const rocYear = year - 1911
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mm}&stkno=${code}&o=json`
        const resp = await $fetch<any>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

        debugLog.push(`${code} OTC rows=${resp?.aaData?.length ?? 0}`)

        if (resp?.aaData?.length) {
          const toInsert: { stock_code: string; date: string; close_price: number }[] = []
          for (const row of resp.aaData) {
            const dateRaw = row[0] as string
            const close = parseFloat((row[6] as string).replace(/,/g, ''))
            if (isNaN(close) || close <= 0) continue
            const parts = dateRaw.split('/')
            if (parts.length < 3) continue
            const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
            toInsert.push({ stock_code: code, date: isoDate, close_price: close })
          }
          if (toInsert.length) {
            const { error: upsertErr } = await client
              .from('stock_daily_prices')
              .upsert(toInsert, { onConflict: 'stock_code,date' })
            if (upsertErr) {
              debugLog.push(`${code} OTC upsert失敗: ${upsertErr.message}`)
            } else {
              pricesInserted += toInsert.length
              debugLog.push(`${code} OTC: 寫入${toInsert.length}筆`)
              for (const r of toInsert) {
                if (!dayMap[r.date]) dayMap[r.date] = {}
                dayMap[r.date][code] = r.close_price
              }
            }
          }
        }
      } catch (e: any) {
        debugLog.push(`${code} OTC例外: ${e?.message ?? e}`)
      }
    }
  }

  // 重算範圍 = 本月「有抓到價的交易日」∪「本月已存在的快照日期」。
  // 後者確保：非交易日或當天價格延遲未入庫的日子（如 2026-07-10 全市場無資料），
  // 只要已有舊快照，也會用前一交易日的價格（carry-forward）與最新持股重算 total_cost／市值，
  // 不會留下舊快照的殘值（先前 total_cost 被停在改動持股前的數字，導致該日成本突兀跳動）。
  const { data: existingSnapDates } = await client
    .from('portfolio_daily_snapshot')
    .select('date')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const dateSet = new Set<string>([
    ...Object.keys(dayMap),
    ...((existingSnapDates ?? []).map((r: any) => r.date)),
  ])
  const tradingDays = [...dateSet].sort()

  if (!tradingDays.length) {
    return { success: true, pricesInserted, snapshotsInserted: 0, tradingDays: 0, debug: debugLog }
  }

  // 取上個月最後一筆快照
  const { data: lastSnapArr } = await client
    .from('portfolio_daily_snapshot')
    .select('date, total_cost')
    .eq('user_id', userId)
    .lt('date', monthStart)
    .order('date', { ascending: false })
    .limit(1)
  const lastSnap = lastSnapArr?.[0] ?? null

  let prevTradingDay: string | null = lastSnap?.date ?? null

  // Rolling WACC：依帳戶初始化到上個月為止的所有交易，與持股管理/當日快照一致。
  const waccMap: Record<string, Record<string, { totalCost: number; totalShares: number }>> = {}
  for (const h of holdings.filter(h => !prevTradingDay || h.buy_date <= prevTradingDay)) {
    const code = h.stock_code.toUpperCase()
    const acct = h.account ?? ''
    if (!waccMap[acct]) waccMap[acct] = {}
    if (!waccMap[acct][code]) waccMap[acct][code] = { totalCost: 0, totalShares: 0 }
    if (h.shares > 0) {
      waccMap[acct][code].totalCost += h.shares * Number(h.average_cost)
      waccMap[acct][code].totalShares += h.shares
    } else {
      const entry = waccMap[acct][code]
      const wacc = entry.totalShares > 0
        ? entry.totalCost / entry.totalShares
        : Number(h.average_cost)
      const abs = Math.abs(h.shares)
      entry.totalCost = Math.max(0, entry.totalCost - wacc * abs)
      entry.totalShares = Math.max(0, entry.totalShares - abs)
    }
  }
  let runningTotalCost = lastSnap?.total_cost ?? 0

  const snapshots: any[] = []
  const lastKnownPrice: Record<string, number> = { ...priorPriceMap }
  const missingPriceLog = new Set<string>()

  for (const date of tradingDays) {
    for (const [code, price] of Object.entries(dayMap[date] ?? {})) {
      lastKnownPrice[code] = price
    }

    // 計算當日淨持股市值
    const netMap: Record<string, number> = {}
    for (const h of holdings.filter(h => h.buy_date <= date)) {
      const code = h.stock_code.toUpperCase()
      netMap[code] = (netMap[code] ?? 0) + h.shares
    }
    let totalStock = 0
    for (const [code, netShares] of Object.entries(netMap)) {
      if (netShares <= 0) continue
      const price = dayMap[date]?.[code] ?? lastKnownPrice[code]
      if (price != null) {
        totalStock += price * netShares
      } else {
        missingPriceLog.add(`${date}: ${code} 缺少歷史價格，該日略過此檔`)
      }
    }
    if (totalStock === 0) continue

    // 今日（含假日順延）的所有交易
    const todayTrades = holdings.filter(h =>
      h.buy_date <= date && (!prevTradingDay || h.buy_date > prevTradingDay)
    )

    // 更新 rolling WACC，計算 total_cost 與 daily_trade_amount
    let dailyTradeAmount = 0
    for (const h of todayTrades) {
      const code = h.stock_code.toUpperCase()
      const acct = h.account ?? ''
      if (!waccMap[acct]) waccMap[acct] = {}
      if (!waccMap[acct][code]) waccMap[acct][code] = { totalCost: 0, totalShares: 0 }
      if (h.shares > 0) {
        const cost = h.shares * Number(h.average_cost)
        waccMap[acct][code].totalCost += cost
        waccMap[acct][code].totalShares += h.shares
        runningTotalCost += cost          // 買入：加買入金額
        dailyTradeAmount += cost
      } else {
        const entry = waccMap[acct][code]
        const wacc = entry.totalShares > 0
          ? entry.totalCost / entry.totalShares
          : Number(h.average_cost)
        const abs = Math.abs(h.shares)
        const costBasis = wacc * abs
        entry.totalCost = Math.max(0, entry.totalCost - costBasis)
        entry.totalShares = Math.max(0, entry.totalShares - abs)
        runningTotalCost -= costBasis     // 賣出：扣均成本
        dailyTradeAmount -= costBasis
      }
    }

    snapshots.push({
      user_id: userId,
      date,
      total_value: Math.round(totalStock),
      total_cost: Math.round(runningTotalCost),
      daily_trade_amount: Math.round(dailyTradeAmount),
    })
    prevTradingDay = date
  }

  if (snapshots.length) {
    await client.from('portfolio_daily_snapshot')
      .upsert(snapshots, { onConflict: 'user_id,date' })
  }

  if (missingPriceLog.size) {
    debugLog.push(...Array.from(missingPriceLog).slice(0, 50))
    if (missingPriceLog.size > 50) debugLog.push(`另有 ${missingPriceLog.size - 50} 筆缺價訊息省略`)
  }

  const pricesTotal = Object.values(dayMap).reduce((s, v) => s + Object.keys(v).length, 0)

  return {
    success: true,
    pricesInserted,
    pricesTotal,
    snapshotsInserted: snapshots.length,
    tradingDays: tradingDays.length,
    firstDay: tradingDays[0] ?? null,
    lastDay: tradingDays[tradingDays.length - 1] ?? null,
    debug: debugLog,
  }
})
