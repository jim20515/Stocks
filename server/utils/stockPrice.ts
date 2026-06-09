const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='
const TWSE_DAY_ALL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const OTC_QUOTES = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const LISTED_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
const OTC_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_O'

// MIS 回傳 key 為小寫，Ch 格式為 "tse_2330.tw"
interface MisItem { c?: string; z?: string; y?: string; n?: string; ch?: string }
interface MisResp { msgArray?: MisItem[] }
interface TwsePrice { Code: string; Name: string; ClosingPrice: string }
interface OtcPrice { SecuritiesCompanyCode: string; ClosePrice: string }
interface CompanyInfo { 公司代號: string; 公司簡稱: string }

function parseMisPrice(item: MisItem): number | null {
  // z = 最新成交價；若為 "-" 表示尚未成交，改用 y（昨收）
  for (const v of [item.z, item.y]) {
    if (v && v !== '-') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
  }
  return null
}

// ch 欄位格式："tse_2330.tw" 或 "otc_6510.tw"
function codeFromCh(ch: string | undefined): string | null {
  if (!ch) return null
  const m = ch.match(/(?:tse|otc)_(.+?)\.tw/)
  return m ? m[1].toUpperCase() : null
}

/** 查詢單一股票名稱與現價（優先 MIS 即時） */
export async function lookupStock(code: string): Promise<{ name: string; price: number | null } | null> {
  for (const ex of ['tse', 'otc']) {
    try {
      // 不 encode，直接拼接
      const data = await $fetch<MisResp>(`${MIS_URL}${ex}_${code}.tw`)
      const item = data?.msgArray?.[0]
      if (item?.n?.trim()) {
        return { name: item.n.trim(), price: parseMisPrice(item) }
      }
    } catch {}
  }

  // 盤後 fallback
  try {
    const list = await $fetch<TwsePrice[]>(TWSE_DAY_ALL)
    const item = list?.find(s => s.Code.trim().toUpperCase() === code.toUpperCase())
    if (item) {
      const price = parseFloat(item.ClosingPrice.replace(/,/g, ''))
      return { name: item.Name.trim(), price: isNaN(price) ? null : price }
    }
  } catch {}

  for (const url of [LISTED_URL, OTC_URL]) {
    try {
      const list = await $fetch<CompanyInfo[]>(url)
      const item = list?.find(c => c.公司代號.trim().toUpperCase() === code.toUpperCase())
      if (item) return { name: item.公司簡稱.trim(), price: null }
    } catch {}
  }

  return null
}

/** 批次取得多支股票今日股價 */
export async function fetchPrices(codes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  if (!codes.length) return result

  const BATCH = 50

  for (const ex of ['tse', 'otc']) {
    const remaining = codes.filter(c => !(c.toUpperCase() in result))
    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH)
      // ⚠️ 不可 encode，| 必須是原始字元
      const ex_ch = batch.map(c => `${ex}_${c}.tw`).join('|')
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

  // TWSE 盤後 fallback
  const missing = codes.filter(c => !(c.toUpperCase() in result))
  if (missing.length) {
    try {
      const list = await $fetch<TwsePrice[]>(TWSE_DAY_ALL)
      const missingSet = new Set(missing.map(c => c.toUpperCase()))
      for (const item of list ?? []) {
        const c = item.Code.trim().toUpperCase()
        if (!missingSet.has(c)) continue
        const p = parseFloat(item.ClosingPrice.replace(/,/g, ''))
        if (!isNaN(p)) result[c] = p
      }
    } catch {}
  }

  // OTC 盤後 fallback
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
