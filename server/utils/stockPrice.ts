const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='
const OTC_QUOTES = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const LISTED_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
const OTC_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_O'

interface MisItem { c?: string; z?: string; y?: string; n?: string; ch?: string }
interface MisResp { msgArray?: MisItem[] }
interface OtcPrice { SecuritiesCompanyCode: string; ClosePrice: string }
interface CompanyInfo { 公司代號: string; 公司簡稱: string }
interface TwseDayResp { stat?: string; title?: string; data?: string[][] }

function parseMisPrice(item: MisItem): number | null {
  for (const v of [item.z, item.y]) {
    if (v && v !== '-') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
  }
  return null
}

function codeFromCh(ch: string | undefined): string | null {
  if (!ch) return null
  const m = ch.match(/(?:tse|otc)_(.+?)\.tw/)
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
  // 1. MIS 即時
  for (const ex of ['tse', 'otc']) {
    try {
      const data = await $fetch<MisResp>(`${MIS_URL}${ex}_${code.toLowerCase()}.tw`)
      const item = data?.msgArray?.[0]
      if (item?.n?.trim()) {
        return { name: item.n.trim(), price: parseMisPrice(item) }
      }
    } catch {}
  }

  // 2. TWSE 個股月報表（同時取名稱與最新收盤）
  const twse = await fetchTwseDayLatest(code)
  if (twse.name) return { name: twse.name, price: twse.price }

  // 3. 公司代號列表（名稱 only）
  for (const url of [LISTED_URL, OTC_URL]) {
    try {
      const list = await $fetch<CompanyInfo[]>(url)
      const item = list?.find(c => c.公司代號.trim().toUpperCase() === code.toUpperCase())
      if (item) return { name: item.公司簡稱.trim(), price: twse.price }
    } catch {}
  }

  return null
}

/** 批次取得多支股票今日股價 */
export async function fetchPrices(codes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  if (!codes.length) return result

  const BATCH = 50

  // 1. MIS 即時（盤中）
  for (const ex of ['tse', 'otc']) {
    const remaining = codes.filter(c => !(c.toUpperCase() in result))
    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH)
      const ex_ch = batch.map(c => `${ex}_${c.toLowerCase()}.tw`).join('|')
      try {
        const data = await $fetch<MisResp>(`${MIS_URL}${ex_ch}`)
        for (const item of data?.msgArray ?? []) {
          const code = codeFromCh(item.ch)
          if (!code) continue
          const price = parseMisPrice(item)
          if (price !== null) result[code] = price
        }
      } catch {}
    }
  }

  // 2. MIS 抓不到的 → TWSE 個股月報表（並行，永遠最新）
  const missing = codes.filter(c => !(c.toUpperCase() in result))
  if (missing.length) {
    await Promise.all(missing.map(async (code) => {
      const { price } = await fetchTwseDayLatest(code)
      if (price !== null) result[code.toUpperCase()] = price
    }))
  }

  // 3. 還找不到的 → OTC 盤後（上櫃）
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
