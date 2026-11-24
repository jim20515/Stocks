// 持股成本計算（唯一來源）：依「帳戶 × 股票代號」各自計算移動加權平均成本（WACC）。
// summary / 快照 / 排程 / 匯入 / 資產配置 / 管理員頁全部呼叫這裡，避免各自複製邏輯而口徑不一。
//
// 規則：
// - 買入：該帳戶該股的總成本 += 成交價 × 股數，股數 += 股數。
// - 賣出：以「賣出當下該帳戶的 WACC」沖銷成本（WACC 不變），已實現損益 = (賣價 − WACC) × 股數。
// - 未指定帳戶（null / 空白）自成一組。
// - 交易須依 交易日 → id 排序後計算（同日多筆時順序才固定）。
//
// 本檔不依賴 Nuxt 自動匯入，scripts/ 底下的維運腳本也可直接 import。

export interface CostTrade {
  id?: number | null
  stock_code: string
  shares: number | string
  average_cost: number | string
  account?: string | null
  buy_date?: string | null
}

export interface Position {
  account: string
  code: string
  totalCost: number
  totalShares: number
}

export interface SellInfo {
  /** 賣出當下該帳戶的 WACC */
  wacc: number
  /** 沖銷的成本（WACC × 賣出股數） */
  costBasis: number
  /** 已實現損益（未四捨五入） */
  realized: number
}

/** 帳戶分組 key：去除前後空白，null / 空字串 → '' */
export function accountKey(account: string | null | undefined): string {
  return (account ?? '').trim()
}

/** 依 交易日 → id 排序（不改動原陣列） */
export function sortTrades<T extends CostTrade>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = String(a.buy_date ?? '')
    const db = String(b.buy_date ?? '')
    if (da !== db) return da < db ? -1 : 1
    return Number(a.id ?? 0) - Number(b.id ?? 0)
  })
}

/** 逐筆累計的帳戶別持倉帳本，可分段 apply（歷史快照逐日推進時使用） */
export class CostLedger {
  readonly positions = new Map<string, Position>()

  private key(account: string, code: string) {
    return `${account}\u0000${code}`
  }

  get(account: string | null | undefined, code: string): Position {
    const acct = accountKey(account)
    const c = code.toUpperCase()
    const k = this.key(acct, c)
    let p = this.positions.get(k)
    if (!p) {
      p = { account: acct, code: c, totalCost: 0, totalShares: 0 }
      this.positions.set(k, p)
    }
    return p
  }

  /** 套用一筆交易；賣出時回傳沖銷資訊，買入回傳 null */
  apply(h: CostTrade): SellInfo | null {
    const shares = Number(h.shares)
    const price = Number(h.average_cost)
    const p = this.get(h.account, h.stock_code)
    if (shares > 0) {
      p.totalCost += price * shares
      p.totalShares += shares
      return null
    }
    const abs = Math.abs(shares)
    const wacc = p.totalShares > 0 ? p.totalCost / p.totalShares : price
    const costBasis = wacc * abs
    p.totalCost = Math.max(0, p.totalCost - costBasis)
    p.totalShares = Math.max(0, p.totalShares - abs)
    if (p.totalShares === 0) p.totalCost = 0
    return { wacc, costBasis, realized: (price - wacc) * abs }
  }

  /** 仍有持股的部位 */
  open(): Position[] {
    return [...this.positions.values()].filter(p => p.totalShares > 0)
  }

  /** 有持股的代號 */
  openCodes(): string[] {
    return [...new Set(this.open().map(p => p.code))]
  }

  /** 所有持倉成本合計（未四捨五入） */
  totalCost(): number {
    return this.open().reduce((s, p) => s + p.totalCost, 0)
  }
}

export interface CostBasisResult {
  ledger: CostLedger
  /** 賣出交易 id → 沖銷資訊 */
  sells: Map<number, SellInfo>
}

/** 對整批交易計算帳戶別 WACC（內部會先排序） */
export function computeCostBasis(rows: CostTrade[]): CostBasisResult {
  const ledger = new CostLedger()
  const sells = new Map<number, SellInfo>()
  for (const h of sortTrades(rows)) {
    const info = ledger.apply(h)
    if (info && h.id != null) sells.set(Number(h.id), info)
  }
  return { ledger, sells }
}

/** 當日買賣淨現金流：買入 = +成交金額，賣出 = −賣出金額（用賣價）。
 *  每日漲跌 = 今日市值 − 昨日市值 − 這個值，才會只反映股價變動。 */
export function tradeCashFlow(rows: CostTrade[]): number {
  return rows.reduce((s, h) => s + Number(h.shares) * Number(h.average_cost), 0)
}
