// 共用股價更新邏輯：抓 TWSE→TPEx→Yahoo 月資料，補進共用表 stock_daily_prices。
// 只動 stock_daily_prices（全域共用），不碰 user_stock_tracking（會員各自）。
type DailyPrice = { date: string; close_price: number }
type FetchResult = { source: 'TWSE' | 'TPEx' | 'Yahoo' | 'none'; prices: DailyPrice[] }

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function addMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}
function getMonthEnd(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}
function parseRocRows(rows: any[] = []) {
  const result: DailyPrice[] = []
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = String(dateRaw).split('/')
    if (parts.length < 3) continue
    const date = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    result.push({ date, close_price: close })
  }
  return result
}
function parseYahooRows(resp: any) {
  const result: DailyPrice[] = []
  const item = resp?.chart?.result?.[0]
  const timestamps = item?.timestamp ?? []
  const closes = item?.indicators?.quote?.[0]?.close ?? []
  for (let i = 0; i < timestamps.length; i++) {
    const close = Number(closes[i])
    if (!Number.isFinite(close) || close <= 0) continue
    const date = new Date(timestamps[i] * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    result.push({ date, close_price: close })
  }
  return result
}
async function fetchYahooMonthPrices(code: string, year: number, month: number) {
  const period1 = Math.floor(Date.UTC(year, month - 1, 1) / 1000)
  const period2 = Math.floor(Date.UTC(year, month, 1) / 1000)
  for (const symbol of [`${code}.TW`, `${code}.TWO`]) {
    try {
      const resp = await $fetch<any>(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
      )
      const rows = parseYahooRows(resp)
      if (rows.length) return rows
    } catch {}
  }
  return []
}
export async function fetchMonthPrices(code: string, year: number, month: number): Promise<FetchResult> {
  const mm = String(month).padStart(2, '0')
  try {
    const resp = await $fetch<any>(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${year}${mm}01&stockNo=${code}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    )
    if (resp?.stat === 'OK' && resp.data?.length) {
      const prices = parseRocRows(resp.data)
      if (prices.length) return { source: 'TWSE', prices }
    }
  } catch {}
  try {
    const resp = await $fetch<any>(
      `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${year - 1911}/${mm}&stkno=${code}&o=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    if (resp?.aaData?.length) {
      const prices = parseRocRows(resp.aaData)
      if (prices.length) return { source: 'TPEx', prices }
    }
  } catch {}
  const yahoo = await fetchYahooMonthPrices(code, year, month)
  if (yahoo.length) return { source: 'Yahoo', prices: yahoo }
  return { source: 'none', prices: [] }
}

// 把 [startDate, endDate] 依月補進 stock_daily_prices（最多 maxMonths 個月）
export async function syncPriceRange(
  client: any, code: string, startDate: string, endDate: string, maxMonths = 24,
): Promise<{ inserted: number; monthsProcessed: number; nextStartDate: string | null }> {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw createError({ statusCode: 400, message: '日期區間不正確' })
  }
  const cap = Math.min(Math.max(maxMonths, 1), 36)
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  const months: { year: number; month: number; key: string }[] = []
  while (cursor <= endMonth && months.length < cap) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, key: toMonthKey(cursor) })
    cursor = addMonth(cursor)
  }

  let inserted = 0
  for (const m of months) {
    const monthStart = `${m.key}-01`
    const monthEnd = getMonthEnd(m.year, m.month)
    const { data: existing, error: existingError } = await client
      .from('stock_daily_prices')
      .select('date')
      .eq('stock_code', code)
      .gte('date', monthStart)
      .lte('date', monthEnd)
    if (existingError) continue

    const fetched = await fetchMonthPrices(code, m.year, m.month)
    if (!fetched.prices.length) continue

    const existingDates = new Set((existing ?? []).map((r: any) => r.date))
    const missingByDate = new Map<string, { stock_code: string; date: string; close_price: number }>()
    for (const row of fetched.prices) {
      if (existingDates.has(row.date) || missingByDate.has(row.date)) continue
      missingByDate.set(row.date, { stock_code: code, date: row.date, close_price: row.close_price })
    }
    const missingRows = Array.from(missingByDate.values())
    if (!missingRows.length) continue

    const { error } = await client
      .from('stock_daily_prices')
      .upsert(missingRows, { onConflict: 'stock_code,date', ignoreDuplicates: true })
    if (!error) inserted += missingRows.length
  }

  return {
    inserted,
    monthsProcessed: months.length,
    nextStartDate: cursor <= endMonth ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01` : null,
  }
}
