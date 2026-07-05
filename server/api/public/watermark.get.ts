// 公開水位分析（訪客可試玩）。只用公開的即時價 + Yahoo 歷史高點，不需登入、不需持有該股。
interface YahooChartResp {
  chart: { result?: Array<{ indicators: { quote: Array<{ high: (number | null)[] }> } }> }
}

async function fetchATH(code: string): Promise<number | null> {
  for (const suffix of ['.TW', '.TWO']) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1mo&range=max&includePrePost=false`
      const data = await $fetch<YahooChartResp>(url)
      const highs = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.high ?? []
      const ath = Math.max(...highs.filter((v): v is number => v !== null && !isNaN(v)))
      if (isFinite(ath) && ath > 0) return Math.round(ath * 100) / 100
    } catch {}
  }
  return null
}

export default defineEventHandler(async (event) => {
  checkRateLimit(event, 'public-watermark', 60, 60 * 1000)
  const code = normalizeStockCode(getQuery(event).code)

  const [priceMap, ath, lookup] = await Promise.all([
    fetchPrices([code]),
    fetchATH(code),
    lookupStock(code).catch(() => null),
  ])

  const currentPrice = priceMap[code] ?? null
  const drawdownPct = ath && currentPrice
    ? Math.round((currentPrice - ath) / ath * 10000) / 100
    : 0

  const levels = [0.1, 0.2, 0.3].map(pct => ({
    pct: Math.round(pct * 100),
    up: ath ? Math.round(ath * (1 + pct) * 100) / 100 : null,
    down: ath ? Math.round(ath * (1 - pct) * 100) / 100 : null,
  }))

  return {
    stockCode: code,
    stockName: lookup?.name ?? code,
    currentPrice,
    watermarkPrice: ath,
    drawdownPct,
    levels,
  }
})
