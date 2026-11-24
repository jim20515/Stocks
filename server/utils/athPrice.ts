// 歷史最高價（ATH）：水位分析用。Yahoo 台股 ETF 常沒有登錄拆股，回傳的是未還原分割的原始高點
// （例：00662 1 拆 5 後 Yahoo ATH 仍是 127.7），需依系統的分割紀錄還原，否則距 ATH 會變成 -80%。
import { fetchPriceSplits, splitFactor, type PriceSplit } from './splitAdjust'

interface YahooDailyResp {
  chart: {
    result?: Array<{
      timestamp?: number[]
      events?: { splits?: Record<string, { date: number; numerator: number; denominator: number }> }
      indicators: { quote: Array<{ high: (number | null)[] }> }
    }>
  }
}

const toTaipeiDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

/** Yahoo 已自行登錄（並還原）的分割不再重複處理：基準日前後 30 天內有倍數相近的 split 事件即視為已還原 */
function yahooKnows(split: PriceSplit, events: Array<{ date: string; ratio: number }>): boolean {
  const t = new Date(split.split_date).getTime()
  return events.some(e => Math.abs(new Date(e.date).getTime() - t) <= 30 * 86400000 && Math.abs(e.ratio - split.ratio) / split.ratio < 0.05)
}

export async function fetchSplitAdjustedATH(code: string, client?: any): Promise<number | null> {
  let splits: PriceSplit[] = []
  const db = useServiceDb() ?? client
  if (db) {
    try { splits = await fetchPriceSplits(db, [code]) } catch (e: any) {
      console.error('[ath] 讀取分割紀錄失敗：', e?.message ?? e)
    }
  }

  for (const suffix of ['.TW', '.TWO']) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1d&range=max&events=split&includePrePost=false`
      const data = await $fetch<YahooDailyResp>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const r = data?.chart?.result?.[0]
      const ts = r?.timestamp ?? []
      const highs = r?.indicators?.quote?.[0]?.high ?? []
      if (!ts.length) continue
      const yEvents = Object.values(r?.events?.splits ?? {}).map(s => ({ date: toTaipeiDate(s.date), ratio: s.denominator ? s.numerator / s.denominator : 0 }))
      const pending = splits.filter(s => !yahooKnows(s, yEvents))

      let ath = 0
      for (let i = 0; i < ts.length; i++) {
        const h = highs[i]
        if (h == null || !Number.isFinite(h) || h <= 0) continue
        const adj = pending.length ? h / splitFactor(pending, code, toTaipeiDate(ts[i]!)) : h
        if (adj > ath) ath = adj
      }
      if (ath > 0) return Math.round(ath * 100) / 100
    } catch {}
  }
  return null
}
