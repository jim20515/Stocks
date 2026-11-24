// 股票分割（拆股）價格還原：唯一來源。
//
// 共用日線表 stock_daily_prices 一律存「已還原分割」的價格（與持股單據被 ×ratio / ÷ratio 後的口徑一致）。
// 但證交所 STOCK_DAY / 櫃買的月報回傳的是「原始、未還原」收盤價，所以任何把 TWSE/TPEx 價格寫進
// stock_daily_prices 或拿來算市值的地方，都必須先經過 adjustRawPrices()。
// Yahoo chart API 的 close 本身已還原分割，不要再除一次。
//
// 本檔核心函式不依賴 Nuxt 自動匯入，scripts/ 底下的維運腳本也可直接 import。

export interface PriceSplit {
  stock_code: string
  split_date: string
  ratio: number
}

const PAGE = 1000

/** 讀取所有「已套用且有同步還原日線」的分割（跨使用者去重：同代號同基準日只算一次）。 */
export async function fetchPriceSplits(client: any, codes?: string[]): Promise<PriceSplit[]> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = client
      .from('stock_splits')
      .select('stock_code, split_date, ratio')
      .eq('status', 'applied')
      .eq('adjust_daily_prices', true)
    if (codes?.length) q = q.in('stock_code', codes.map(c => c.toUpperCase()))
    const { data, error } = await q.order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`讀取分割紀錄失敗：${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return dedupeSplits(rows.map(r => ({
    stock_code: String(r.stock_code).toUpperCase(),
    split_date: String(r.split_date),
    ratio: Number(r.ratio),
  })))
}

export function dedupeSplits(splits: PriceSplit[]): PriceSplit[] {
  const map = new Map<string, PriceSplit>()
  for (const s of splits) {
    if (!(s.ratio > 0)) continue
    map.set(`${s.stock_code.toUpperCase()}|${s.split_date}`, { ...s, stock_code: s.stock_code.toUpperCase() })
  }
  return [...map.values()]
}

/** 某代號某日期的原始價需要除以多少（多次分割時連乘）。基準日當天（含）以前都要除。 */
export function splitFactor(splits: PriceSplit[], code: string, date: string): number {
  const c = code.toUpperCase()
  let f = 1
  for (const s of splits) {
    if (s.stock_code === c && date <= s.split_date) f *= s.ratio
  }
  return f
}

export function adjustRawPrice(splits: PriceSplit[], code: string, date: string, price: number): number {
  const f = splitFactor(splits, code, date)
  return f === 1 ? price : Math.round((price / f) * 100) / 100
}

/** 把 TWSE/TPEx 抓回來的原始收盤價還原分割（Yahoo 來源請勿呼叫）。 */
export function adjustRawPrices<T extends { date: string; close_price: number }>(
  splits: PriceSplit[], code: string, rows: T[],
): T[] {
  if (!splits.some(s => s.stock_code === code.toUpperCase())) return rows
  return rows.map(r => ({ ...r, close_price: adjustRawPrice(splits, code, r.date, r.close_price) }))
}

/** 分頁讀取某代號在日期區間內的全部日線（避開 PostgREST 每次最多 1000 筆的截斷）。 */
export async function fetchAllDailyPrices(
  client: any, code: string, opts: { from?: string; to?: string } = {},
): Promise<{ stock_code: string; date: string; close_price: number }[]> {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = client.from('stock_daily_prices').select('stock_code, date, close_price').eq('stock_code', code)
    if (opts.from) q = q.gte('date', opts.from)
    if (opts.to) q = q.lte('date', opts.to)
    const { data, error } = await q.order('date').range(from, from + PAGE - 1)
    if (error) throw new Error(`讀取 ${code} 日線失敗：${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** 把某代號「基準日（含）以前」的全部日線乘上 multiplier（÷ratio 傳 1/ratio）。分批寫回，任何一批失敗即拋錯。 */
export async function scaleDailyPrices(
  client: any, code: string, toDate: string, multiplier: number,
): Promise<number> {
  const rows = await fetchAllDailyPrices(client, code, { to: toDate })
  const updated = rows.map(p => ({
    stock_code: p.stock_code,
    date: p.date,
    close_price: Math.round(Number(p.close_price) * multiplier * 100) / 100,
  }))
  const BATCH = 500
  let count = 0
  for (let i = 0; i < updated.length; i += BATCH) {
    const chunk = updated.slice(i, i + BATCH)
    const { error } = await client.from('stock_daily_prices').upsert(chunk, { onConflict: 'stock_code,date' })
    if (error) throw new Error(`日線寫入失敗（已完成 ${count} / ${updated.length} 筆）：${error.message}`)
    count += chunk.length
  }
  return count
}

/** 其他（不含 excludeId）已套用、且有還原日線的同代號同基準日分割筆數。共用日線表只能被還原一次。 */
export async function countOtherPriceSplits(
  client: any, code: string, splitDate: string, excludeId?: string | number | null,
): Promise<number> {
  let q = client
    .from('stock_splits')
    .select('id')
    .eq('stock_code', code.toUpperCase())
    .eq('split_date', splitDate)
    .eq('status', 'applied')
    .eq('adjust_daily_prices', true)
  if (excludeId != null) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) throw new Error(`讀取分割紀錄失敗：${error.message}`)
  return data?.length ?? 0
}
