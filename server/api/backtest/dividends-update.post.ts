export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const code = String(body?.code ?? '').trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  // Yahoo Finance: fetch full dividend history
  const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const symbols = [`${code}.TW`, `${code}.TWO`]

  let dividends: { stock_code: string; ex_date: string; dividend_per_share: number }[] = []

  for (const symbol of symbols) {
    try {
      const resp = await $fetch<any>(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=div`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
      )
      const divMap: Record<string, { amount: number }> = resp?.chart?.result?.[0]?.events?.dividends ?? {}
      if (!Object.keys(divMap).length) continue

      dividends = Object.entries(divMap).map(([ts, v]) => {
        const dt = new Date(Number(ts) * 1000)
        const ex_date = dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
        return { stock_code: code, ex_date, dividend_per_share: v.amount }
      })
      break
    } catch {}
  }

  if (!dividends.length) {
    return { code, inserted: 0, message: '無配息資料（Yahoo Finance）' }
  }

  const { error } = await client
    .from('stock_dividends')
    .upsert(dividends, { onConflict: 'stock_code,ex_date', ignoreDuplicates: false })

  if (error) throw createError({ statusCode: 500, message: error.message })

  return { code, inserted: dividends.length }
})
