import { createClient } from '@supabase/supabase-js'

// 使用者資訊（管理員限定）：彙總每個帳號的 總成本／總市值／未實現損益／實現損益。
// 用 service_role 讀所有使用者的 stock_holdings（繞過 RLS），計算邏輯與個人版 summary.get.ts 一致。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const url = process.env.SUPABASE_URL ?? useRuntimeConfig().supabaseUrl as string
  const serviceKey = process.env.NUXT_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? (useRuntimeConfig() as any).supabaseServiceKey
  if (!serviceKey) throw createError({ statusCode: 500, message: 'NUXT_SUPABASE_SECRET_KEY 未設定' })
  const admin = createClient(url as string, serviceKey as string, { auth: { persistSession: false } })

  // 1. 讀所有使用者的持股（分頁，繞過 RLS）。依 user_id、buy_date 排序，確保 WACC/實現損益計算順序正確。
  const holdings: any[] = []
  const PAGE = 1000
  let from = 0
  while (from < 100_000) {
    const { data, error } = await admin
      .from('stock_holdings')
      .select('user_id, stock_code, shares, average_cost, account, buy_date, id')
      .order('user_id', { ascending: true })
      .order('buy_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw createError({ statusCode: 500, message: error.message })
    if (!data?.length) break
    holdings.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // 2. 一次抓齊所有代號現價（避免每個帳號各打一次外部 API）
  const allCodes = new Set<string>()
  for (const h of holdings) allCodes.add(h.stock_code.toUpperCase())
  const priceInfos = await fetchPricesWithChange([...allCodes])

  // 3. 依 user_id 分組
  const byUser: Record<string, any[]> = {}
  for (const h of holdings) {
    if (!byUser[h.user_id]) byUser[h.user_id] = []
    byUser[h.user_id].push(h)
  }

  // 單一帳號的四個總計（與 summary.get.ts 的加權平均成本邏輯相同）
  function computeTotals(rows: any[]) {
    // runningMap: account → code → { totalCost, totalShares }；null account 用 '' 自成一組
    const runningMap: Record<string, Record<string, { totalCost: number; totalShares: number }>> = {}
    let realizedProfit = 0

    for (const h of rows) {
      const code = h.stock_code.toUpperCase()
      const acct = h.account ?? ''
      if (!runningMap[acct]) runningMap[acct] = {}
      if (!runningMap[acct][code]) runningMap[acct][code] = { totalCost: 0, totalShares: 0 }

      if (h.shares > 0) {
        runningMap[acct][code].totalCost += Number(h.average_cost) * h.shares
        runningMap[acct][code].totalShares += h.shares
      } else {
        // 賣出：以當下加權平均成本計算實現損益
        const { totalCost, totalShares } = runningMap[acct][code]
        const wacc = totalShares > 0 ? totalCost / totalShares : Number(h.average_cost)
        const sellPrice = Number(h.average_cost)
        const absShares = Math.abs(h.shares)
        // 每筆賣出各自四捨五入後再加總，與個人版 summary.get.ts 一致
        realizedProfit += Math.round((sellPrice - wacc) * absShares)
        runningMap[acct][code].totalCost = Math.max(0, totalCost - wacc * absShares)
        runningMap[acct][code].totalShares = Math.max(0, totalShares - absShares)
      }
    }

    // 總成本／總市值：跨帳戶加總（每帳戶各自 WACC × 淨持股）
    let totalCost = 0
    let totalValue = 0
    for (const codeMap of Object.values(runningMap)) {
      for (const [code, { totalCost: cost, totalShares: shares }] of Object.entries(codeMap)) {
        if (shares <= 0) continue
        const wacc = cost / shares
        const info = priceInfos[code]
        totalCost += wacc * shares
        totalValue += info?.price ? info.price * shares : wacc * shares
      }
    }
    totalCost = Math.round(totalCost)
    totalValue = Math.round(totalValue)

    return {
      totalCost,
      totalValue,
      unrealizedProfit: totalValue - totalCost,
      realizedProfit: Math.round(realizedProfit),
    }
  }

  // 4. 取所有註冊帳號（含沒有持股的），補上 email
  const authUsers: any[] = []
  let page = 1
  while (page < 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw createError({ statusCode: 500, message: error.message })
    const list = data?.users ?? []
    authUsers.push(...list)
    if (list.length < 200) break
    page++
  }

  const users = authUsers.map((u) => {
    const rows = byUser[u.id] ?? []
    const totals = rows.length
      ? computeTotals(rows)
      : { totalCost: 0, totalValue: 0, unrealizedProfit: 0, realizedProfit: 0 }
    return {
      userId: u.id,
      email: u.email ?? '(未知)',
      holdingsCount: rows.length,
      ...totals,
    }
  })

  return {
    users,
    total: users.length,
    priceDate: new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
  }
})
