// Vercel Cron Job：每天台北時間 14:35（UTC 06:35）自動存快照
// 對所有用戶各存一筆當日收盤資料
export default defineEventHandler(async (event) => {
  // 驗證 Vercel Cron 呼叫（防止外部亂打）
  const authHeader = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // 用 service role key 取得所有用戶清單
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw createError({ statusCode: 500, message: 'SUPABASE_SERVICE_KEY not set' })

  const supabaseUrl = process.env.SUPABASE_URL!
  const { createClient } = await import('@supabase/supabase-js')
  const adminClient = createClient(supabaseUrl, serviceKey)

  // 取得所有有持股的 user_id
  const { data: users } = await adminClient
    .from('stock_holdings')
    .select('user_id')
    .gt('shares', 0)

  if (!users?.length) return { success: true, processed: 0 }

  const uniqueUsers = [...new Set(users.map(u => u.user_id))]
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const results = []

  for (const userId of uniqueUsers) {
    try {
      // 取得該用戶持股與設定
      const [{ data: holdings }, { data: settings }] = await Promise.all([
        adminClient.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date'),
        adminClient.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
      ])

      if (!holdings?.length) continue

      // 計算 WACC
      const runningMap: Record<string, { totalCost: number; totalShares: number }> = {}
      for (const h of holdings) {
        const code = h.stock_code.toUpperCase()
        if (!runningMap[code]) runningMap[code] = { totalCost: 0, totalShares: 0 }
        if (h.shares > 0) {
          runningMap[code].totalCost += Number(h.average_cost) * h.shares
          runningMap[code].totalShares += h.shares
        } else {
          const { totalCost, totalShares } = runningMap[code]
          const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
          const abs = Math.abs(h.shares)
          runningMap[code].totalCost = Math.max(0, totalCost - wacc * abs)
          runningMap[code].totalShares = Math.max(0, totalShares - abs)
        }
      }

      // 淨持股
      const netSharesMap: Record<string, number> = {}
      for (const h of holdings) {
        const code = h.stock_code.toUpperCase()
        netSharesMap[code] = (netSharesMap[code] ?? 0) + h.shares
      }

      const codes = Object.keys(netSharesMap).filter(c => netSharesMap[c] > 0)
      const priceInfos = await fetchPricesWithChange(codes)

      let totalValue = 0
      let totalPrevValue = 0
      for (const code of codes) {
        const netShares = netSharesMap[code]
        const info = priceInfos[code]
        const wacc = runningMap[code]?.totalShares > 0
          ? runningMap[code].totalCost / runningMap[code].totalShares : 0
        const price = info?.price ?? wacc
        const prevClose = info?.prevClose ?? price
        totalValue += price * netShares
        totalPrevValue += prevClose * netShares
      }

      const cashAmount = Number((settings as any)?.cash_amount ?? 0)
      totalValue = Math.round(totalValue) + cashAmount
      const dailyChange = Math.round(totalValue - totalPrevValue - cashAmount)
      const dailyChangePct = totalPrevValue > 0
        ? Math.round(dailyChange / totalPrevValue * 10000) / 100
        : null

      await adminClient.from('portfolio_daily_snapshot').upsert({
        user_id: userId,
        date: today,
        total_value: totalValue,
        daily_change: dailyChange,
        daily_change_pct: dailyChangePct,
      }, { onConflict: 'user_id,date' })

      results.push({ userId, success: true })
    } catch (e: any) {
      results.push({ userId, success: false, error: e.message })
    }
  }

  return { success: true, date: today, processed: results.length, results }
})
