// 歷史資料匯入：從第一筆交易日開始，抓所有股票每日收盤價，重算每日投資組合市值
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const [{ data: holdings }, { data: settings }] = await Promise.all([
    client.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date'),
    client.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
  ])

  if (!holdings?.length) return { success: true, message: '尚無交易記錄' }

  const cashAmount = Number((settings as any)?.cash_amount ?? 0)

  // 找最早交易日
  const firstDate = holdings[0].buy_date as string
  const allCodes = [...new Set(holdings.map(h => h.stock_code.toUpperCase()))]

  // Step 1: 抓歷史收盤價（逐月）
  const today = new Date()
  const startDate = new Date(firstDate)
  const priceMap: Record<string, Record<string, number>> = {} // code → date → price

  for (const code of allCodes) {
    priceMap[code] = {}

    // 先查 DB 已有的資料
    const { data: existing } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
    for (const row of existing ?? []) {
      priceMap[code][row.date] = Number(row.close_price)
    }

    // 逐月抓 TWSE（補缺漏的月份）
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    while (cur <= today) {
      const dateStr = `${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, '0')}01`

      // 檢查這個月是否已有資料
      const monthKey = dateStr.slice(0, 7).replace('', '-').slice(0, 7)
      const hasThisMonth = Object.keys(priceMap[code]).some(d => d.startsWith(dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6)))

      if (!hasThisMonth) {
        try {
          const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`
          const resp = await $fetch<any>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

          if (resp?.stat === 'OK' && resp.data?.length) {
            const toInsert: { stock_code: string; date: string; close_price: number }[] = []
            for (const row of resp.data) {
              // row: [日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數]
              const dateRaw = row[0] as string // 格式：115/06/13（民國）
              const closeRaw = (row[6] as string).replace(/,/g, '')
              const close = parseFloat(closeRaw)
              if (isNaN(close)) continue

              // 民國轉西元
              const parts = dateRaw.split('/')
              const year = parseInt(parts[0]) + 1911
              const isoDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`

              priceMap[code][isoDate] = close
              toInsert.push({ stock_code: code, date: isoDate, close_price: close })
            }
            if (toInsert.length) {
              await client.from('stock_daily_prices')
                .upsert(toInsert, { onConflict: 'stock_code,date' })
            }
          }
        } catch {}

        // OTC 備援
        if (!Object.keys(priceMap[code]).some(d => d.startsWith(dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6)))) {
          try {
            const y = cur.getFullYear() - 1911
            const m = String(cur.getMonth() + 1).padStart(2, '0')
            const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${y}/${m}&stkno=${code}&o=json`
            const resp = await $fetch<any>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })

            if (resp?.aaData?.length) {
              const toInsert: { stock_code: string; date: string; close_price: number }[] = []
              for (const row of resp.aaData) {
                const dateRaw = row[0] as string
                const closeRaw = (row[6] as string).replace(/,/g, '')
                const close = parseFloat(closeRaw)
                if (isNaN(close)) continue

                const parts = dateRaw.split('/')
                const year = parseInt(parts[0]) + 1911
                const isoDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`

                priceMap[code][isoDate] = close
                toInsert.push({ stock_code: code, date: isoDate, close_price: close })
              }
              if (toInsert.length) {
                await client.from('stock_daily_prices')
                  .upsert(toInsert, { onConflict: 'stock_code,date' })
              }
            }
          } catch {}
        }
      }

      cur.setMonth(cur.getMonth() + 1)
    }
  }

  // Step 2: 依日期重算每日投資組合市值
  // 取得所有有收盤價的日期
  const allDates = new Set<string>()
  for (const code of allCodes) {
    for (const date of Object.keys(priceMap[code])) {
      if (date >= firstDate) allDates.add(date)
    }
  }
  const sortedDates = [...allDates].sort()

  const snapshots: { user_id: string; date: string; total_value: number; daily_change: number; daily_change_pct: number | null }[] = []

  let prevTotalStock = 0

  for (const date of sortedDates) {
    // 計算截至當天的淨持股（只含當天或之前的交易）
    const activeHoldings = holdings.filter(h => h.buy_date <= date)

    // 計算淨持股 map
    const netMap: Record<string, number> = {}
    for (const h of activeHoldings) {
      const code = h.stock_code.toUpperCase()
      netMap[code] = (netMap[code] ?? 0) + h.shares
    }

    // 計算當天總市值（股票部位）
    let totalStock = 0
    for (const [code, netShares] of Object.entries(netMap)) {
      if (netShares <= 0) continue
      const price = priceMap[code]?.[date]
      if (price == null) continue
      totalStock += price * netShares
    }

    const totalValue = Math.round(totalStock) + cashAmount
    const dailyChange = Math.round(totalStock - prevTotalStock)
    const dailyChangePct = prevTotalStock > 0
      ? Math.round(dailyChange / prevTotalStock * 10000) / 100
      : null

    snapshots.push({
      user_id: userId,
      date,
      total_value: totalValue,
      daily_change: dailyChange,
      daily_change_pct: dailyChangePct,
    })

    prevTotalStock = totalStock
  }

  // 批次寫入 portfolio_daily_snapshot
  const BATCH = 50
  for (let i = 0; i < snapshots.length; i += BATCH) {
    await client.from('portfolio_daily_snapshot')
      .upsert(snapshots.slice(i, i + BATCH), { onConflict: 'user_id,date' })
  }

  return {
    success: true,
    datesProcessed: sortedDates.length,
    firstDate,
    lastDate: sortedDates[sortedDates.length - 1] ?? null,
  }
})
