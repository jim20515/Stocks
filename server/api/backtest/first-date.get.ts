function monthIndex(year: number, month: number) {
  return year * 12 + month - 1
}

function fromMonthIndex(idx: number) {
  return {
    year: Math.floor(idx / 12),
    month: idx % 12 + 1,
  }
}

function parseTwseFirstDate(rows: any[] = []) {
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    return `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }
  return null
}

function parseTpexFirstDate(rows: any[] = []) {
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    return `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }
  return null
}

async function fetchFirstTradingDateInMonth(code: string, year: number, month: number) {
  const mm = String(month).padStart(2, '0')
  const dateStr = `${year}${mm}01`

  try {
    const resp = await $fetch<any>(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    )
    if (resp?.stat === 'OK' && resp.data?.length) {
      return parseTwseFirstDate(resp.data)
    }
  } catch {}

  try {
    const rocYear = year - 1911
    const resp = await $fetch<any>(
      `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mm}&stkno=${code}&o=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    if (resp?.aaData?.length) {
      return parseTpexFirstDate(resp.aaData)
    }
  } catch {}

  return null
}

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const code = normalizeStockCode(getQuery(event).code)
  checkRateLimit(event, `first-date:${code}`, 20, 60 * 1000)

  // TWSE/TPEx 公開月資料以近代電子資料為主。若更早資料源補齊後，可調整此起點。
  const startIdx = monthIndex(2004, 1)
  const now = new Date()
  const endIdx = monthIndex(now.getFullYear(), now.getMonth() + 1)

  let left = startIdx
  let right = endIdx
  let foundIdx: number | null = null

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const { year, month } = fromMonthIndex(mid)
    const firstDate = await fetchFirstTradingDateInMonth(code, year, month)

    if (firstDate) {
      foundIdx = mid
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  if (foundIdx == null) {
    throw createError({ statusCode: 404, message: '查無歷史交易資料' })
  }

  const { year, month } = fromMonthIndex(foundIdx)
  const firstDate = await fetchFirstTradingDateInMonth(code, year, month)
  if (!firstDate) throw createError({ statusCode: 404, message: '查無歷史交易資料' })

  return {
    code,
    firstDate,
    sourceNote: '以 TWSE/TPEx 公開月成交資料查得的第一筆交易日',
  }
})
