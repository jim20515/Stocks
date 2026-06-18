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

  const allCodes = [...new Set(holdings.map(h => h.stock_code.toUpperCase()))]

  const mm = String(month).padStart(2, '0')
  const dateStr = `${year}${mm}01`

  let pricesInserted = 0
  const debugLog: string[] = []
  // 直接在記憶體中建 dayMap，不在 INSERT 後再 SELECT
  const dayMap: Record<string, Record<string, number>> = {}

  for (const code of allCodes) {
    // 查 DB 這個月是否已有資料
    const { data: existing } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
      .gte('date', `${year}-${mm}-01`)
      .lte('date', `${year}-${mm}-31`)

    if (existing?.length) {
      debugLog.push(`${code}: DB已有${existing.length}筆，跳過`)
      // 已有資料也要加入 dayMap
      for (const row of existing) {
        if (!dayMap[row.date]) dayMap[row.date] = {}
        dayMap[row.date][code] = Number(row.close_price)
      }
      continue
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

  const tradingDays = Object.keys(dayMap).sort()

  if (!tradingDays.length) {
    return { success: true, pricesInserted, snapshotsInserted: 0, tradingDays: 0, debug: debugLog }
  }

  // 取前一交易日資料（上個月最後一筆快照）
  const { data: lastSnap } = await client
    .from('portfolio_daily_snapshot')
    .select('date, total_value')
    .eq('user_id', userId)
    .lt('date', `${year}-${mm}-01`)
    .order('date', { ascending: false })
    .limit(1)

  let prevTotalStock: number | null = lastSnap?.[0]?.total_value ?? null
  let prevTradingDay: string | null = lastSnap?.[0]?.date ?? null

  const snapshots: any[] = []

  for (const date of tradingDays) {
    const activeHoldings = holdings.filter(h => h.buy_date <= date)
    const netMap: Record<string, number> = {}
    for (const h of activeHoldings) {
      const code = h.stock_code.toUpperCase()
      netMap[code] = (netMap[code] ?? 0) + h.shares
    }

    let totalStock = 0
    for (const [code, netShares] of Object.entries(netMap)) {
      if (netShares <= 0) continue
      const price = dayMap[date]?.[code]
      if (price == null) continue
      totalStock += price * netShares
    }

    if (totalStock === 0) continue  // 當日無持股，略過

    // 上一個交易日之後到今日之間的所有買賣（涵蓋週末/假日輸入的交易）
    const todayTrades = holdings.filter(h =>
      h.buy_date <= date && (prevTradingDay === null || h.buy_date > prevTradingDay)
    )
    const dailyTradeAmount = Math.round(todayTrades.reduce((s, h) => s + Math.abs(h.shares) * Number(h.average_cost), 0))

    // 當日買賣對市值的影響（以成交價計算），用來還原純漲跌
    // 用成交價才能保留買入當天從成交價漲到收盤價的獲利
    let tradeMarketImpact = 0
    for (const h of todayTrades) {
      tradeMarketImpact += h.shares * Number(h.average_cost)
    }

    const totalValue = Math.round(totalStock)

    let dailyChange: number
    let dailyChangePct: number | null
    if (prevTotalStock !== null) {
      dailyChange = Math.round(totalStock - prevTotalStock - tradeMarketImpact)
      dailyChangePct = prevTotalStock > 0 ? Math.round(dailyChange / prevTotalStock * 10000) / 100 : null
    } else {
      // 第一天：漲跌 = 收盤市值 - 成交金額
      const purchaseCost = todayTrades.reduce((s, h) => s + h.shares * Number(h.average_cost), 0)
      dailyChange = Math.round(totalStock - purchaseCost)
      dailyChangePct = purchaseCost > 0 ? Math.round(dailyChange / purchaseCost * 10000) / 100 : null
    }

    snapshots.push({ user_id: userId, date, total_value: totalValue, daily_change: dailyChange, daily_change_pct: dailyChangePct, daily_trade_amount: dailyTradeAmount })
    prevTotalStock = totalStock
    prevTradingDay = date
  }

  if (snapshots.length) {
    await client.from('portfolio_daily_snapshot')
      .upsert(snapshots, { onConflict: 'user_id,date' })
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
