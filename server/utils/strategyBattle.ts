// 策略實戰共用邏輯：欄位驗證 + LIFO（先進後出）分批配對損益計算
// LIFO 與 app/pages/backtest/strategy.vue 的回測引擎一致，刻意不採用持股管理的 WACC 平均成本法。

export type BattleRow = {
  name: string
  filter_code: string | null
  filter_account: string | null
  filter_start_date: string | null
  filter_end_date: string | null
  include_fee: boolean
}

// 從 request body 解析並驗證實戰群組欄位（POST / PATCH 共用）
export function parseBattleBody(body: any): BattleRow {
  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: '群組名稱不能為空' })
  if (name.length > 40) throw createError({ statusCode: 400, message: '群組名稱過長' })

  const codeRaw = String(body?.filterCode ?? '').trim()
  const filter_code = codeRaw ? normalizeStockCode(codeRaw) : null

  const acctRaw = String(body?.filterAccount ?? '').trim()
  const filter_account = acctRaw ? acctRaw.slice(0, 40) : null

  const filter_start_date = body?.filterStartDate ? normalizeDate(body.filterStartDate, '起始日期') : null
  const filter_end_date = body?.filterEndDate ? normalizeDate(body.filterEndDate, '結束日期') : null

  const include_fee = body?.includeFee !== false

  return { name, filter_code, filter_account, filter_start_date, filter_end_date, include_fee }
}

const FEE_RATE = 0.1425 / 100          // 手續費 0.1425%
const FEE_MIN = 20                     // 最低手續費 20 元

// ETF（0 開頭）證交稅 0.1%，一般股票 0.3%
function taxRateFor(code: string): number {
  return /^0\d{4,5}[A-Z]?$/.test(code.toUpperCase()) ? 0.1 / 100 : 0.3 / 100
}

// 已實現配對：一筆買（的一部分）對到一筆賣。
// orphan=true 代表這筆賣出的對應買入被日期/篩選切掉了（找不到買入），
// 此時 buyDate/buyPrice/profit 為 null —— 只把這筆賣出「呈現」出來，不計入損益、庫存維持 0。
export type BattlePair = {
  code: string
  buyDate: string | null
  buyPrice: number | null
  sellDate: string
  sellPrice: number
  shares: number
  profit: number | null
  orphan: boolean
  sharesAfter: number       // 這筆賣出之後的剩餘股數（庫存，floored 至 0）
}

// 未實現（尚未賣出）的剩餘批次
export type OpenLot = {
  code: string
  buyDate: string
  buyPrice: number
  shares: number
  currentPrice: number | null
  unrealizedProfit: number | null
  sharesAfter: number       // 這筆買入之後的剩餘股數（庫存）
}

export type BattleResult = {
  pairs: BattlePair[]
  openLots: OpenLot[]
  totalCost: number
  realizedProfit: number
  unrealizedProfit: number
  totalProfit: number
  returnPct: number | null
  buyCount: number
  sellCount: number
  pairCount: number
  winCount: number
  remainingShares: number
}

type Holding = {
  stock_code: string
  shares: number
  average_cost: number | string
  buy_date: string
}

/**
 * 依 stock_code 分組跑 LIFO 分批配對：
 * - 買入 → 建立一個未平倉批次（記手續費/股）。
 * - 賣出 → 從「最近的批次」開始逐一配對（後進先出），可跨批、可拆批，每段配對成一筆 pair。
 * - 剩餘未平倉批次 → 用現價算未實現損益。
 */
export function computeLifoResult(
  holdings: Holding[],
  priceMap: Record<string, number>,
  includeFee: boolean,
): BattleResult {
  const byCode: Record<string, Holding[]> = {}
  for (const h of holdings) {
    const code = h.stock_code.toUpperCase()
    ;(byCode[code] ??= []).push(h)
  }

  const pairs: BattlePair[] = []
  const openLots: OpenLot[] = []
  let realizedProfit = 0
  let unrealizedProfit = 0
  let totalCost = 0        // 投入資本（所有買入金額 + 手續費）
  let buyCount = 0
  let sellCount = 0
  let winCount = 0
  let remainingShares = 0

  for (const [code, rows] of Object.entries(byCode)) {
    // 未平倉批次（陣列尾端 = 最近買入 = LIFO 先配對）；sharesAfterBuy = 買入當下的庫存
    const lots: { date: string; price: number; shares: number; feePerShare: number; sharesAfterBuy: number }[] = []
    const taxRate = taxRateFor(code)
    let running = 0   // 該股當前庫存股數

    for (const h of rows) {
      const price = Number(h.average_cost)
      const absShares = Math.abs(h.shares)
      if (absShares === 0) continue
      const amount = price * absShares

      if (h.shares > 0) {
        // 買入
        const fee = includeFee ? Math.max(Math.round(amount * FEE_RATE), FEE_MIN) : 0
        running += absShares
        lots.push({ date: h.buy_date, price, shares: absShares, feePerShare: fee / absShares, sharesAfterBuy: running })
        totalCost += amount + fee
        buyCount++
      } else {
        // 賣出：LIFO 逐批配對
        const fee = includeFee ? Math.max(Math.round(amount * FEE_RATE), FEE_MIN) : 0
        const tax = includeFee ? Math.round(amount * taxRate) : 0
        const sellFeePerShare = (fee + tax) / absShares
        const pairStart = pairs.length
        let remaining = absShares
        let matchedTotal = 0
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[lots.length - 1]
          const match = Math.min(remaining, lot.shares)
          const profit = (price - lot.price - lot.feePerShare - sellFeePerShare) * match
          realizedProfit += profit
          matchedTotal += match
          if (profit > 0) winCount++
          pairs.push({
            code, buyDate: lot.date, buyPrice: lot.price,
            sellDate: h.buy_date, sellPrice: price, shares: match, profit: Math.round(profit), orphan: false, sharesAfter: 0,
          })
          lot.shares -= match
          remaining -= match
          if (lot.shares === 0) lots.pop()
        }
        // remaining > 0：賣出的對應買入被日期/篩選切掉（幽靈）→ 該筆照列出來，
        // 但庫存維持 0（不變負）、不計入損益，僅呈現。
        if (remaining > 0) {
          pairs.push({
            code, buyDate: null, buyPrice: null,
            sellDate: h.buy_date, sellPrice: price, shares: remaining, profit: null, orphan: true, sharesAfter: 0,
          })
        }
        running = Math.max(0, running - matchedTotal)
        // 這筆賣出配出的所有 pair（含孤兒）都標記賣出後的剩餘股數
        for (let k = pairStart; k < pairs.length; k++) pairs[k].sharesAfter = running
        sellCount++
      }
    }

    // 剩餘未平倉批次 → 未實現損益
    const currentPrice = priceMap[code] ?? null
    for (const lot of lots) {
      const unreal = currentPrice != null ? (currentPrice - lot.price - lot.feePerShare) * lot.shares : null
      if (unreal != null) unrealizedProfit += unreal
      remainingShares += lot.shares
      openLots.push({
        code, buyDate: lot.date, buyPrice: lot.price, shares: lot.shares,
        currentPrice, unrealizedProfit: unreal != null ? Math.round(unreal) : null, sharesAfter: lot.sharesAfterBuy,
      })
    }
  }

  const totalProfit = realizedProfit + unrealizedProfit
  const returnPct = totalCost > 0 ? Math.round(totalProfit / totalCost * 10000) / 100 : null

  pairs.sort((a, b) => a.sellDate.localeCompare(b.sellDate) || (a.buyDate ?? '').localeCompare(b.buyDate ?? ''))
  openLots.sort((a, b) => a.buyDate.localeCompare(b.buyDate))

  return {
    pairs,
    openLots,
    totalCost: Math.round(totalCost),
    realizedProfit: Math.round(realizedProfit),
    unrealizedProfit: Math.round(unrealizedProfit),
    totalProfit: Math.round(totalProfit),
    returnPct,
    buyCount,
    sellCount,
    pairCount: pairs.length,
    winCount,
    remainingShares,
  }
}
