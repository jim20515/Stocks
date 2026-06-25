type DailyPrice = {
  date: string
  close_price: number
}

type FetchResult = {
  source: 'TWSE' | 'TPEx' | 'Yahoo' | 'none'
  prices: DailyPrice[]
}

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

function parseTwseRows(code: string, rows: any[] = []) {
  const result: DailyPrice[] = []
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    const date = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    result.push({ date, close_price: close })
  }
  return result
}

function parseTpexRows(code: string, rows: any[] = []) {
  const result: DailyPrice[] = []
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
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
  const symbols = [`${code}.TW`, `${code}.TWO`]

  for (const symbol of symbols) {
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

async function fetchMonthPrices(code: string, year: number, month: number): Promise<FetchResult> {
  const mm = String(month).padStart(2, '0')
  const dateStr = `${year}${mm}01`

  try {
    const resp = await $fetch<any>(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    )
    if (resp?.stat === 'OK' && resp.data?.length) {
      const prices = parseTwseRows(code, resp.data)
      if (prices.length) return { source: 'TWSE', prices }
    }
  } catch {}

  try {
    const rocYear = year - 1911
    const resp = await $fetch<any>(
      `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mm}&stkno=${code}&o=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    if (resp?.aaData?.length) {
      const prices = parseTpexRows(code, resp.aaData)
      if (prices.length) return { source: 'TPEx', prices }
    }
  } catch {}

  const yahooPrices = await fetchYahooMonthPrices(code, year, month)
  if (yahooPrices.length) return { source: 'Yahoo', prices: yahooPrices }

  return { source: 'none', prices: [] }
}

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const code = String(body?.code ?? '').trim().toUpperCase()
  const startDate = String(body?.startDate ?? '2004-01-01')
  const endDate = String(body?.endDate ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }))
  const maxMonths = Math.min(Math.max(Number(body?.maxMonths ?? 24), 1), 36)

  if (!userId) throw createError({ statusCode: 401, message: '未登入' })
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw createError({ statusCode: 400, message: '日期區間不正確' })
  }

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  const months: { year: number; month: number; key: string }[] = []
  while (cursor <= endMonth && months.length < maxMonths) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, key: toMonthKey(cursor) })
    cursor = addMonth(cursor)
  }

  let inserted = 0
  const logs: string[] = []
  const monthResults: { key: string; hasData: boolean }[] = []

  for (const m of months) {
    const monthStart = `${m.key}-01`
    const monthEnd = getMonthEnd(m.year, m.month)
    const { data: existing, error: existingError } = await client
      .from('stock_daily_prices')
      .select('date, close_price')
      .eq('stock_code', code)
      .gte('date', monthStart)
      .lte('date', monthEnd)

    if (existingError) {
      logs.push(`${m.key}: 查詢既有資料失敗 ${existingError.message}`)
      continue
    }

    const fetched = await fetchMonthPrices(code, m.year, m.month)
    if (!fetched.prices.length) {
      monthResults.push({ key: m.key, hasData: Boolean(existing?.length) })
      logs.push(`${m.key}: 無資料`)
      continue
    }
    monthResults.push({ key: m.key, hasData: true })

    const existingDates = new Set((existing ?? []).map(row => row.date))
    const missingByDate = new Map<string, { stock_code: string; date: string; close_price: number }>()
    for (const row of fetched.prices) {
      if (existingDates.has(row.date)) continue
      if (missingByDate.has(row.date)) continue
      missingByDate.set(row.date, { stock_code: code, date: row.date, close_price: row.close_price })
    }
    const missingRows = Array.from(missingByDate.values())

    if (!missingRows.length) {
      logs.push(`${m.key}: DB已有${existing?.length ?? 0}筆，資料完整，略過（來源：${fetched.source}）`)
      continue
    }

    const { error } = await client
      .from('stock_daily_prices')
      .upsert(missingRows, { onConflict: 'stock_code,date', ignoreDuplicates: true })
    if (error) {
      logs.push(`${m.key}: 寫入失敗 ${error.message}`)
      continue
    }
    inserted += missingRows.length
    logs.push(`${m.key}: 補入缺少的${missingRows.length}筆（來源：${fetched.source}）`)
  }

  const dataMonthIndexes = monthResults
    .map((result, idx) => result.hasData ? idx : -1)
    .filter(idx => idx >= 0)
  const firstDataIdx = dataMonthIndexes[0]
  const lastDataIdx = dataMonthIndexes[dataMonthIndexes.length - 1]
  if (firstDataIdx != null && lastDataIdx != null) {
    for (let i = firstDataIdx; i <= lastDataIdx; i++) {
      const result = monthResults[i]
      if (result && !result.hasData) {
        logs.push(`${result.key}: 疑似資料缺口（前後月份有資料，建議人工檢查）`)
      }
    }
  }

  const { data, error } = await client
    .from('stock_daily_prices')
    .select('date, close_price')
    .eq('stock_code', code)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (error) throw createError({ statusCode: 500, message: error.message })

  return {
    code,
    inserted,
    monthsProcessed: months.length,
    nextStartDate: cursor <= endMonth ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01` : null,
    prices: data ?? [],
    logs,
  }
})
