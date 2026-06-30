const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='
const OTC_QUOTES = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const LISTED_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
const OTC_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_O'

interface MisItem { c?: string; z?: string; y?: string; n?: string; ch?: string; b?: string; a?: string }
export interface PriceInfo { price: number; prevClose: number | null; changePct: number | null }
interface MisResp { msgArray?: MisItem[] }
interface OtcPrice { SecuritiesCompanyCode: string; ClosePrice: string }
interface CompanyInfo { 公司代號: string; 公司簡稱: string }
interface TwseDayResp { stat?: string; title?: string; data?: string[][] }

function parseMisPrice(item: MisItem): number | null {
  // z = 最新成交價，盤中優先
  if (item.z && item.z !== '-') {
    const n = parseFloat(item.z)
    if (!isNaN(n)) return n
  }
  // 盤中無成交時，用委買/委賣均價
  const bid = item.b ? parseFloat(item.b.split('_')[0]) : NaN
  const ask = item.a ? parseFloat(item.a.split('_')[0]) : NaN
  if (!isNaN(bid) && !isNaN(ask) && bid > 0 && ask > 0) {
    return Math.round((bid + ask) / 2 * 100) / 100
  }
  if (!isNaN(bid) && bid > 0) return bid
  if (!isNaN(ask) && ask > 0) return ask
  // 最後退回昨收
  if (item.y && item.y !== '-') {
    const n = parseFloat(item.y)
    if (!isNaN(n)) return n
  }
  return null
}

function codeFromCh(ch: string | undefined): string | null {
  if (!ch) return null
  const m = ch.match(/(?:tse|otc)_(.+?)\.tw/) ?? ch.match(/^(.+?)\.tw$/)
  return m ? m[1].toUpperCase() : null
}

/** 從 TWSE 個股月報表取最新一筆收盤價與股票名稱 */
async function fetchTwseDayLatest(code: string): Promise<{ price: number | null; name: string | null }> {
  const today = new Date()
  for (let offset = 0; offset <= 1; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 1)
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`
    try {
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`
      const resp = await $fetch<TwseDayResp>(url)
      if (resp?.stat === 'OK' && resp.data?.length) {
        const last = resp.data[resp.data.length - 1]
        const p = parseFloat(last[6].replace(/,/g, ''))
        // title 格式："115年06月 00675L 富邦臺灣加權正2  各日成交資訊"
        const nameMatch = resp.title?.match(/\d{5,6}[A-Za-z]?\s+(.+?)\s{2,}/)
          ?? resp.title?.match(/\S+\s+(.+?)\s*各日/)
        const name = nameMatch?.[1]?.trim() ?? null
        return { price: isNaN(p) ? null : p, name }
      }
    } catch {}
  }
  return { price: null, name: null }
}

/** 查詢單一股票名稱與現價 */
export async function lookupStock(code: string): Promise<{ name: string; price: number | null } | null> {
  let name: string | null = null
  let price: number | null = null

  // 1. MIS 即時（取名稱）
  for (const ex of ['tse', 'otc']) {
    try {
      const data = await $fetch<MisResp>(`${MIS_URL}${ex}_${code.toLowerCase()}.tw`)
      const item = data?.msgArray?.[0]
      if (item?.n?.trim()) { name = item.n.trim(); break }
    } catch {}
  }

  // 2. Yahoo Finance 即時價格（主要來源，與列表一致）
  try {
    const data = await $fetch<any>(
      `https://query2.finance.yahoo.com/v8/finance/chart/${code}.TW?interval=1m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const p = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (p && p > 0) price = p
  } catch {}

  // 3. 若名稱或價格缺，用 TWSE 月報補
  if (!name || price === null) {
    const twse = await fetchTwseDayLatest(code)
    if (!name && twse.name) name = twse.name
    if (price === null) price = twse.price
  }

  if (name) return { name, price }

  // 4. 公司代號列表（名稱 only）
  for (const url of [LISTED_URL, OTC_URL]) {
    try {
      const list = await $fetch<CompanyInfo[]>(url)
      const item = list?.find(c => c.公司代號.trim().toUpperCase() === code.toUpperCase())
      if (item) return { name: item.公司簡稱.trim(), price }
    } catch {}
  }

  return null
}

/** Yahoo Finance 批次即時報價 */
async function fetchYahooPrices(codes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  const BATCH = 20
  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH)
    const symbols = batch.map(c => `${c}.TW`).join(',')
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${batch[0]}.TW?interval=1m&range=1d`
      // 單支直接用 chart API；多支並行
      await Promise.all(batch.map(async (code) => {
        try {
          const data = await $fetch<any>(
            `https://query2.finance.yahoo.com/v8/finance/chart/${code}.TW?interval=1m&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          )
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
          if (price && price > 0) result[code.toUpperCase()] = price
        } catch {}
      }))
    } catch {}
  }
  return result
}

async function fetchYahooPriceInfos(codes: string[]): Promise<Record<string, PriceInfo>> {
  const result: Record<string, PriceInfo> = {}
  const BATCH = 20
  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH)
    await Promise.all(batch.map(async (code) => {
      for (const suffix of ['TW', 'TWO']) {
        try {
          const data = await $fetch<any>(
            `https://query2.finance.yahoo.com/v8/finance/chart/${code}.${suffix}?interval=1m&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          )
          const meta = data?.chart?.result?.[0]?.meta
          const price = Number(meta?.regularMarketPrice)
          const prevClose = Number(meta?.previousClose ?? meta?.chartPreviousClose)
          if (!Number.isFinite(price) || price <= 0) continue

          const validPrevClose = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null
          const changePct = validPrevClose
            ? Math.round((price - validPrevClose) / validPrevClose * 10000) / 100
            : null
          result[code.toUpperCase()] = { price, prevClose: validPrevClose, changePct }
          break
        } catch {}
      }
    }))
  }
  return result
}

/** 批次取得多支股票今日股價（含昨收、漲跌幅），主要來源為 MIS */
export async function fetchPricesWithChange(codes: string[]): Promise<Record<string, PriceInfo>> {
  const result: Record<string, PriceInfo> = {}
  if (!codes.length) return result

  // MIS 即時（含昨收 y）
  for (const ex of ['tse', 'otc']) {
    const remaining = codes.filter(c => !(c.toUpperCase() in result))
    for (let i = 0; i < remaining.length; i += 50) {
      const batch = remaining.slice(i, i + 50)
      const ex_ch = batch.map(c => `${ex}_${c.toLowerCase()}.tw`).join('|')
      try {
        const data = await $fetch<MisResp>(`${MIS_URL}${ex_ch}`)
        for (const item of data?.msgArray ?? []) {
          const code = codeFromCh(item.ch)
          if (!code) continue
          const price = parseMisPrice(item)
          if (price === null) continue
          const prevClose = item.y && item.y !== '-' ? parseFloat(item.y) : null
          const changePct = prevClose && prevClose > 0
            ? Math.round((price - prevClose) / prevClose * 10000) / 100
            : null
          result[code] = { price, prevClose, changePct }
        }
      } catch {}
    }
  }

  // 抓不到的 → Yahoo（無昨收資訊）
  const missing = codes.filter(c => !(c.toUpperCase() in result))
  if (missing.length) {
    Object.assign(result, await fetchYahooPriceInfos(missing))
  }

  // 還找不到的 → TWSE 月報備援
  const stillMissing = codes.filter(c => !(c.toUpperCase() in result))
  await Promise.all(stillMissing.map(async (code) => {
    const { price } = await fetchTwseDayLatest(code)
    if (price !== null) result[code.toUpperCase()] = { price, prevClose: null, changePct: null }
  }))

  return result
}

/** 批次取得多支股票今日股價 */
export async function fetchPrices(codes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  if (!codes.length) return result

  // 1. Yahoo Finance 即時（主要來源）
  const yahooResult = await fetchYahooPrices(codes)
  Object.assign(result, yahooResult)

  // 2. 抓不到的 → TWSE 個股月報表（收盤備援）
  const missing = codes.filter(c => !(c.toUpperCase() in result))
  if (missing.length) {
    await Promise.all(missing.map(async (code) => {
      const { price } = await fetchTwseDayLatest(code)
      if (price !== null) result[code.toUpperCase()] = price
    }))
  }

  // 3. 還找不到的 → OTC 盤後
  const stillMissing = codes.filter(c => !(c.toUpperCase() in result))
  if (stillMissing.length) {
    try {
      const list = await $fetch<OtcPrice[]>(OTC_QUOTES)
      const missingSet = new Set(stillMissing.map(c => c.toUpperCase()))
      for (const item of list ?? []) {
        const c = item.SecuritiesCompanyCode.trim().toUpperCase()
        if (!missingSet.has(c)) continue
        const p = parseFloat(item.ClosePrice.replace(/,/g, ''))
        if (!isNaN(p)) result[c] = p
      }
    } catch {}
  }

  return result
}
