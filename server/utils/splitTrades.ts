// 套用分割「之後」才新增、但交易日在分割基準日（含）以前的單據：
// 使用者照券商對帳單輸入的是分割前的股數與價格，必須比照已套用的分割換算（股數 ×倍數、價格 ÷倍數），
// 否則同一檔股票會混著分割前後兩種口徑，持股、成本、市值都會錯。
import { listSplits, appendSplitHoldings, type SplitRecord } from './splitStorage'

interface TradeRow {
  stock_code: string
  shares: number
  average_cost: number
  buy_date: string
  watermark_price?: number | null
}

export interface SplitTradeAdjustment {
  /** rows 的索引 → 套用到的分割紀錄與原始值 */
  applied: Map<number, { records: SplitRecord[]; original: { shares: number; average_cost: number; watermark_price: number | null } }>
  notes: string[]
}

/** 就地換算 rows，回傳換算明細（之後用 recordSplitTradeOriginals 把原始值記進分割紀錄） */
export async function adjustTradesForSplits(client: any, userId: string, rows: TradeRow[]): Promise<SplitTradeAdjustment> {
  const applied: SplitTradeAdjustment['applied'] = new Map()
  const notes: string[] = []
  const splits = (await listSplits(client, userId))
    .filter(s => s.status === 'applied')
    .sort((a, b) => a.split_date.localeCompare(b.split_date))
  if (!splits.length) return { applied, notes }

  rows.forEach((row, idx) => {
    const code = row.stock_code.toUpperCase()
    const hits = splits.filter(s => s.stock_code.toUpperCase() === code && row.buy_date <= s.split_date)
    if (!hits.length) return
    const original = { shares: row.shares, average_cost: row.average_cost, watermark_price: row.watermark_price ?? null }
    let shares = row.shares
    let price = row.average_cost
    let watermark = row.watermark_price ?? null
    for (const s of hits) {
      const r = Number(s.ratio)
      shares = Math.round(shares * r)
      price = Math.round((price / r) * 100) / 100
      if (watermark != null) watermark = Math.round((watermark / r) * 100) / 100
    }
    row.shares = shares
    row.average_cost = price
    if (row.watermark_price !== undefined) row.watermark_price = watermark
    applied.set(idx, { records: hits, original })
    notes.push(`${code} ${row.buy_date} 在分割基準日以前，已依 ${hits.map(s => `1 拆 ${s.ratio}`).join('、')} 換算為 ${Math.abs(shares).toLocaleString('zh-TW')} 股 @ ${price}`)
  })
  return { applied, notes }
}

/** 新單據寫入後，把原始值附加進對應的分割紀錄，讓「還原分割」能一併還原 */
export async function recordSplitTradeOriginals(
  client: any, userId: string, adj: SplitTradeAdjustment, insertedIds: number[],
): Promise<void> {
  const byRecord = new Map<string, { record: SplitRecord; entries: any[] }>()
  for (const [idx, { records, original }] of adj.applied) {
    const id = insertedIds[idx]
    if (id == null) continue
    // 多次分割時只記在最早的那筆：還原最早那筆時回到原始值（較晚的分割須先還原）
    const rec = records[0]
    if (!rec) continue
    const k = String(rec.id)
    if (!byRecord.has(k)) byRecord.set(k, { record: rec, entries: [] })
    byRecord.get(k)!.entries.push({ id, ...original })
  }
  for (const { record, entries } of byRecord.values()) {
    await appendSplitHoldings(client, userId, record, entries)
  }
}
