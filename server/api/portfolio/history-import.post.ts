// 單月歷史資料匯入：每次只處理一個月份，避免 Vercel 函式逾時
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)
  const { year, month } = body as { year: number; month: number }

  if (!year || !month) throw createError({ statusCode: 400, message: '缺少 year / month 參數' })

  const [{ data: holdings }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  if (!holdings?.length) return { success: true, pricesInserted: 0, snapshotsInserted: 0 }

  const cashAmount = Number((settings as any)?.cash_amount ?? 0)
  const allCodes = [...new Set(holdings.map(h => h.stock_code.toUpperCase()))]

  const mm = String(month).padStart(2, '0')
  const dateStr = `${year}${mm}01`

  // Step 1: 抓這個月所有股票的收盤價
  const monthPrices: Record<string, Record<string, number>> = {} // code → date → price
  let pricesInserted = 0

  for (const code of allCodes) {
    monthPrices[code] = {}

    // 先查 DB 這個月是否已有資料
    const { data: existing } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
      .gte('date', `${year}-${mm}-01`)
      .lte('date', `${year}-${mm}-31`)

    if (existing?.length) {
      for (const row of existing) monthPrices[code][row.date] = Number(row.close_price)
      continue  // 已有資料，跳過
    }

    // TWSE
    let fetched = false
    try {
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`
      const resp = await $fetch<any>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (resp?.stat === 'OK' && resp.data?.length) {
        const toInsert: { stock_code: string; date: string; close_price: number }[] = []
        for (const row of resp.data) {
          const dateRaw = row[0] as string
          const close = parseFloat((row[6] as string).replace(/,/g, ''))
          if (isNaN(close)) continue
          const parts = dateRaw.split('/')
          const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          monthPrices[code][isoDate] = close
          toInsert.push({ stock_code: code, date: isoDate, close_price: close })
        }
        if (toInsert.length) {
          await client.from('stock_daily_prices').upsert(toInsert, { onConflict: 'stock_code,date' })
          pricesInserted += toInsert.length
          fetched = true
        }
      }
    } catch {}

    // OTC 備援
    if (!fetched) {
      try {
        const rocYear = year - 1911
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mm}&stkno=${code}&o=json`
        const resp = await $fetch<any>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (resp?.aaData?.length) {
          const toInsert: { stock_code: string; date: string; close_price: number }[] = []
          for (const row of resp.aaData) {
            const dateRaw = row[0] as string
            const close = parseFloat((row[6] as string).replace(/,/g, ''))
            if (isNaN(close)) continue
            const parts = dateRaw.split('/')
            const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
            monthPrices[code][isoDate] = close
            toInsert.push({ stock_code: code, date: isoDate, close_price: close })
          }
          if (toInsert.length) {
            await client.from('stock_daily_prices').upsert(toInsert, { onConflict: 'stock_code,date' })
            pricesInserted += toInsert.length
          }
        }
      } catch {}
    }
  }

  // Step 2: 讀取這個月所有已知日期（從 DB）
  const { data: allPricesThisMonth } = await client
    .from('stock_daily_prices')
    .select('stock_code, date, close_price')
    .gte('date', `${year}-${mm}-01`)
    .lte('date', `${year}-${mm}-31`)
    .in('stock_code', allCodes)

  // 整理成 date → code → price
  const dayMap: Record<string, Record<string, number>> = {}
  for (const row of allPricesThisMonth ?? []) {
    if (!dayMap[row.date]) dayMap[row.date] = {}
    dayMap[row.date][row.stock_code.toUpperCase()] = Number(row.close_price)
  }

  // Step 3: 讀取這個月之前所有日期的最後收盤價（作為 prevClose）
  const tradingDays = Object.keys(dayMap).sort()
  if (!tradingDays.length) {
    return { success: true, pricesInserted, snapshotsInserted: 0, tradingDays: 0 }
  }

  // 取得前一交易日的收盤價（查 DB 這個月第一天之前的最後一筆）
  const prevPrices: Record<string, number> = {}
  for (const code of allCodes) {
    const { data: prev } = await client
      .from('stock_daily_prices')
      .select('close_price')
      .eq('stock_code', code)
      .lt('date', `${year}-${mm}-01`)
      .order('date', { ascending: false })
      .limit(1)
    if (prev?.[0]) prevPrices[code] = Number(prev[0].close_price)
  }

  // Step 4: 重算這個月每個交易日的投資組合市值
  const snapshots: any[] = []
  let prevTotalStock: number | null = null

  // 取得這個月第一天之前最後一筆 snapshot 的 total_value（作為起始 prevTotalStock）
  const { data: lastSnap } = await client
    .from('portfolio_daily_snapshot')
    .select('total_value, date')
    .eq('user_id', userId)
    .lt('date', `${year}-${mm}-01`)
    .order('date', { ascending: false })
    .limit(1)

  if (lastSnap?.[0]) {
    prevTotalStock = lastSnap[0].total_value - cashAmount
  }

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

    const totalValue = Math.round(totalStock) + cashAmount

    // prevTotalStock: 用前一天的股票市值
    let dailyChange = 0
    let dailyChangePct: number | null = null
    if (prevTotalStock !== null) {
      dailyChange = Math.round(totalStock - prevTotalStock)
      dailyChangePct = prevTotalStock > 0
        ? Math.round(dailyChange / prevTotalStock * 10000) / 100
        : null
    }

    snapshots.push({ user_id: userId, date, total_value: totalValue, daily_change: dailyChange, daily_change_pct: dailyChangePct })
    prevTotalStock = totalStock
  }

  if (snapshots.length) {
    await client.from('portfolio_daily_snapshot')
      .upsert(snapshots, { onConflict: 'user_id,date' })
  }

  return {
    success: true,
    pricesInserted,
    snapshotsInserted: snapshots.length,
    tradingDays: tradingDays.length,
    firstDay: tradingDays[0] ?? null,
    lastDay: tradingDays[tradingDays.length - 1] ?? null,
  }
})
