// Vercel Cron Job：每天台北時間 14:35（UTC 06:35）自動存快照
// 對所有用戶各存一筆當日收盤資料
export default defineEventHandler(async (event) => {
  // 驗證 Vercel Cron 呼叫（防止外部亂打）
  const authHeader = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    throw createError({ statusCode: 500, message: 'CRON_SECRET not set' })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // 用 service role key 取得所有用戶清單
  const serviceKey = process.env.NUXT_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw createError({ statusCode: 500, message: 'NUXT_SUPABASE_SECRET_KEY not set' })

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
  let processed = 0
  let failed = 0

  for (const userId of uniqueUsers) {
    try {
      // 取得該用戶持股與設定
      const [{ data: holdings }, { data: settings }] = await Promise.all([
        adminClient.from('stock_holdings').select('*').eq('user_id', userId).order('buy_date').order('id'),
        adminClient.from('portfolio_settings').select('cash_amount').eq('user_id', userId).single(),
      ])

      if (!holdings?.length) continue

      // 依帳戶各自計算 WACC（server/utils/costBasis.ts，與持股管理／手動快照一致）
      const { ledger } = computeCostBasis(holdings)
      const codes = ledger.openCodes()
      if (codes.length === 0) continue  // 當日無持股，略過
      const priceInfos = await fetchPricesWithChange(codes)

      let totalValue = 0
      let totalPrevValue = 0
      for (const p of ledger.open()) {
        const info = priceInfos[p.code]
        const price = info?.price ?? p.totalCost / p.totalShares
        const prevClose = info?.prevClose ?? price
        totalValue += price * p.totalShares
        totalPrevValue += prevClose * p.totalShares
      }

      totalValue = Math.round(totalValue)  // 不含現金，純股票市值
      const totalCost = Math.round(ledger.totalCost())

      // 今日買賣淨現金流（用成交價），扣除後只反映股價變動
      const todayTrades = (holdings ?? []).filter((h: any) => h.buy_date === today)
      const tradeMarketImpact = tradeCashFlow(todayTrades)
      const dailyTradeAmount = Math.round(tradeMarketImpact)
      const pureDailyChange = Math.round(totalValue - totalPrevValue - tradeMarketImpact)
      const dailyChangePct = totalPrevValue > 0
        ? Math.round(pureDailyChange / totalPrevValue * 10000) / 100
        : null

      await adminClient.from('portfolio_daily_snapshot').upsert({
        user_id: userId,
        date: today,
        total_value: totalValue,
        total_cost: totalCost,
        daily_change: pureDailyChange,
        daily_change_pct: dailyChangePct,
        daily_trade_amount: dailyTradeAmount,
      }, { onConflict: 'user_id,date' })

      processed++
    } catch (e: any) {
      console.error('[daily-snapshot] failed for user', userId, e?.message ?? e)
      failed++
    }
  }

  return { success: true, date: today, processed, failed }
})
