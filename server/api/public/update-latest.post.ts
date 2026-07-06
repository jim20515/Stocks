// 訪客也能觸發「更新共用股價到最新」。實際寫入由 server 用 service_role 金鑰控管
// （訪客只能觸發、無法直接寫資料庫）。未設定 NUXT_SUPABASE_SECRET_KEY 時回 no-service-key，前端優雅退回。
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const code = normalizeStockCode(body?.code ?? getQuery(event).code)
  checkRateLimit(event, `public-update:${code}`, 12, 60 * 1000)

  const client = useServiceDb()
  if (!client) {
    return { updated: false, reason: 'no-service-key' }
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

  // 查共用表目前最新日期
  const { data: latestRows } = await client
    .from('stock_daily_prices')
    .select('date')
    .eq('stock_code', code)
    .order('date', { ascending: false })
    .limit(1)
  const latestDate: string | null = latestRows?.[0]?.date ?? null

  if (latestDate && latestDate >= today) {
    return { updated: true, alreadyLatest: true, latestDate }
  }

  // 從最新日期隔天（或很早）補到今天
  const nextDate = (d: string) => {
    const dt = new Date(d); dt.setDate(dt.getDate() + 1)
    return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  }
  let cursor: string | null = latestDate ? nextDate(latestDate) : '2000-01-01'
  let inserted = 0
  let guard = 0
  while (cursor && guard < 100) {
    const res = await syncPriceRange(client, code, cursor, today, 6)
    inserted += res.inserted
    cursor = res.nextStartDate
    guard++
  }

  const { data: newLatest } = await client
    .from('stock_daily_prices')
    .select('date')
    .eq('stock_code', code)
    .order('date', { ascending: false })
    .limit(1)

  return { updated: true, inserted, latestDate: newLatest?.[0]?.date ?? latestDate }
})
