// 訪客（未登入）預覽用的範例資料。結構對齊各 API handler 的真實回傳，讓個人頁能以 Demo 呈現。
// 一組示意投資組合：0050 + 006208（1x）＋ 00670L（2x）＋ 現金。

export const DEMO_ACCOUNTS = [
  { id: 1, name: '主帳戶' },
  { id: 2, name: '退休金' },
]

// /api/stockholdings/summary（index / stocks / daily 用）
export const DEMO_SUMMARY = {
  items: [
    { id: 1, stockCode: '0050', stockName: '元大台灣50', shares: 2000, averageCost: 180, buyDate: '2024-03-15', account: '主帳戶', leverageMultiplier: 1, watermarkPrice: null, currentPrice: 195, dailyChangePct: 0.82, cost: 360000, value: 390000, profit: 30000, profitPct: 8.33, isRealized: false },
    { id: 2, stockCode: '006208', stockName: '富邦台50', shares: 3000, averageCost: 100, buyDate: '2024-05-20', account: '主帳戶', leverageMultiplier: 1, watermarkPrice: null, currentPrice: 112, dailyChangePct: 0.71, cost: 300000, value: 336000, profit: 36000, profitPct: 12.0, isRealized: false },
    { id: 3, stockCode: '00670L', stockName: '富邦NASDAQ正2', shares: 1000, averageCost: 90, buyDate: '2024-01-10', account: '退休金', leverageMultiplier: 2, watermarkPrice: 150, currentPrice: 138, dailyChangePct: 1.53, cost: 90000, value: 138000, profit: 48000, profitPct: 53.33, isRealized: false },
  ],
  byCode: [
    { stockCode: '0050', stockName: '元大台灣50', shares: 2000, cost: 360000, value: 390000, profit: 30000, dailyChangePct: 0.82 },
    { stockCode: '006208', stockName: '富邦台50', shares: 3000, cost: 300000, value: 336000, profit: 36000, dailyChangePct: 0.71 },
    { stockCode: '00670L', stockName: '富邦NASDAQ正2', shares: 1000, cost: 90000, value: 138000, profit: 48000, dailyChangePct: 1.53 },
  ],
  cashAmount: 200000,
  totalCost: 750000,
  totalValue: 864000,
  dailyChange: 7800,
  dailyChangePct: 0.91,
  totalProfit: 114000,
  totalProfitPct: 15.2,
  totalRealizedProfit: 0,
  priceDate: '範例資料',
}

// /api/portfolio/beta-summary（allocation / watermark 用）— 佔比基準含現金（總 1,064,000）
export const DEMO_BETA = {
  items: [
    { id: 1, stockCode: '0050', stockName: '元大台灣50', shares: 2000, averageCost: 180, leverageMultiplier: 1, currentPrice: 195, marketValue: 390000, allocation: 0.366541, betaContrib: 0.366541 },
    { id: 2, stockCode: '006208', stockName: '富邦台50', shares: 3000, averageCost: 100, leverageMultiplier: 1, currentPrice: 112, marketValue: 336000, allocation: 0.315789, betaContrib: 0.315789 },
    { id: 3, stockCode: '00670L', stockName: '富邦NASDAQ正2', shares: 1000, averageCost: 90, leverageMultiplier: 2, currentPrice: 138, marketValue: 138000, allocation: 0.129699, betaContrib: 0.259398 },
  ],
  cash: { amount: 200000, allocation: 0.18797 },
  totalValue: 1064000,
  currentBeta: 0.9417,
  targetBeta: 1.1,
  betaDiff: -0.1583,
  targetAlloc: { x1: 70, x2: 20, x0: 10 },
  actualAlloc: { x1: 68.23, x2: 12.97, x0: 18.8 },
}

// /api/portfolio/snapshot（daily 每日漲幅用）— 由舊到新的每日資產快照
export const DEMO_SNAPSHOTS = [
  { date: '2026-06-27', total_value: 1038000, total_cost: 750000 },
  { date: '2026-06-28', total_value: 1044000, total_cost: 750000 },
  { date: '2026-06-30', total_value: 1041000, total_cost: 750000 },
  { date: '2026-07-01', total_value: 1052000, total_cost: 750000 },
  { date: '2026-07-02', total_value: 1056200, total_cost: 750000 },
  { date: '2026-07-03', total_value: 1064000, total_cost: 750000 },
]

// /api/stockholdings/index（live 策略實戰的股票建議清單用）— 原始交易列
export const DEMO_HOLDINGS = [
  { id: 1, stock_code: '0050', stock_name: '元大台灣50', shares: 2000, average_cost: 180, buy_date: '2024-03-15', account: '主帳戶', leverage_multiplier: 1 },
  { id: 2, stock_code: '006208', stock_name: '富邦台50', shares: 3000, average_cost: 100, buy_date: '2024-05-20', account: '主帳戶', leverage_multiplier: 1 },
  { id: 3, stock_code: '00670L', stock_name: '富邦NASDAQ正2', shares: 1000, average_cost: 90, buy_date: '2024-01-10', account: '退休金', leverage_multiplier: 2 },
]

// /api/strategy-battles（live 的實戰群組清單）— 訪客沒有群組
export const DEMO_BATTLES: any[] = []

// /api/portfolio/settings（lifegoal 設定表單）
export const DEMO_SETTINGS = {
  birth_year: 1990,
  cash_amount: 200000,
  target_beta: 1.1,
  initial_amount: 1000000,
  annual_contribution: 500000,
  stop_contribution_year: 2045,
  expected_annual_return: 0.16,
  target_alloc_1x: 70,
  target_alloc_2x: 20,
  start_invest_year: 2022,
  initial_age: 32,
}

// /api/portfolio/life-projection（lifegoal 人生目標）
export const DEMO_PROJECTION = (() => {
  const startInvestYear = 2022
  const initialAge = 32
  const initialAmount = 1000000
  const contrib = 500000
  const stopYear = 2045
  const rate = 0.16
  const currentYear = 2026
  const endYear = startInvestYear + (90 - initialAge)   // 跑到 90 歲
  const rows: any[] = []
  let assets = initialAmount
  let totalContrib = 0
  for (let year = startInvestYear; year <= endYear; year++) {
    const age = initialAge + (year - startInvestYear)
    const interest = Math.round(assets - initialAmount - totalContrib)
    rows.push({ year, age, assets: Math.round(assets), starting: initialAmount, contributions: Math.round(totalContrib), interest: Math.max(0, interest) })
    const contribution = year < stopYear ? contrib : 0
    totalContrib += contribution
    assets = (assets + contribution) * (1 + rate)
  }
  return {
    currentYear, startInvestYear, initialAge,
    settings: { startInvestYear, initialAge, initialAmount, annualContribution: contrib, stopContributionYear: stopYear, expectedAnnualReturn: rate },
    rows,
  }
})()
