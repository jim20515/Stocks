export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  // 只回傳當前使用者追蹤的股票
  const { data: tracking, error: trackError } = await client
    .from('user_stock_tracking')
    .select('stock_code, name')
    .eq('user_id', userId)

  if (trackError) throw createError({ statusCode: 500, message: trackError.message })

  const trackedCodes = (tracking ?? []).map((r: any) => r.stock_code as string)
  const nameMap = new Map((tracking ?? []).map((r: any) => [r.stock_code as string, r.name as string | null]))

  if (!trackedCodes.length) return { codes: [], stocks: [] }

  // 補齊 null 名稱：用 Nitro storage 快取 STOCK_DAY_ALL（1小時）
  const nullCodes = trackedCodes.filter(c => !nameMap.get(c))
  if (nullCodes.length) {
    const storage = useStorage('cache')
    let twseList: { Code: string; Name: string }[] | null = await storage.getItem('twse:stock_day_all')
    if (!twseList) {
      try {
        twseList = await $fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
        await storage.setItem('twse:stock_day_all', twseList, { ttl: 3600 })
      } catch {}
    }
    if (twseList) {
      const twseMap = new Map(twseList.map(c => [c.Code?.trim(), c.Name?.trim()]))
      const updates: Promise<any>[] = []
      for (const code of nullCodes) {
        const name = twseMap.get(code) ?? null
        nameMap.set(code, name)
        if (name) {
          updates.push(
            client.from('user_stock_tracking')
              .update({ name })
              .eq('user_id', userId)
              .eq('stock_code', code),
          )
        }
      }
      await Promise.all(updates)
    }
  }

  // 用 RPC aggregate 一次取得全部統計
  const { data: stats, error: statsError } = await client
    .rpc('get_stock_price_stats', { codes: trackedCodes })

  if (statsError) throw createError({ statusCode: 500, message: statsError.message })

  const statsMap = new Map((stats ?? []).map((r: any) => [
    r.stock_code as string,
    { minDate: r.min_date as string, maxDate: r.max_date as string, count: Number(r.cnt) },
  ]))

  const stocks = trackedCodes.map(code => {
    const s = statsMap.get(code)
    return {
      code,
      name: nameMap.get(code) ?? '—',
      minDate: s?.minDate ?? '—',
      maxDate: s?.maxDate ?? '—',
      count: s?.count ?? 0,
    }
  })

  return { codes: stocks.map(s => s.code), stocks }
})
