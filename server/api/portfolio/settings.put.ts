
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)
  const year = new Date().getFullYear()

  const payload = {
    user_id:                userId,
    cash_amount:            finiteNumber(body.cashAmount            ?? body.cash_amount            ?? 0,        '現金部位', 0, 1_000_000_000_000),
    target_beta:            finiteNumber(body.targetBeta            ?? body.target_beta            ?? 1.46,     '目標 Beta', 0, 20),
    start_invest_year:      finiteNumber(body.startInvestYear       ?? body.start_invest_year      ?? year,     '開始投資年份', 1900, 2200),
    initial_age:            finiteNumber(body.initialAge            ?? body.initial_age            ?? 30,       '起始年齡', 0, 120),
    initial_amount:         finiteNumber(body.initialAmount         ?? body.initial_amount         ?? 20000000, '開始資金', 0, 1_000_000_000_000),
    annual_contribution:    finiteNumber(body.annualContribution    ?? body.annual_contribution    ?? 5000000,  '每年投入', 0, 1_000_000_000_000),
    stop_contribution_year: finiteNumber(body.stopContributionYear  ?? body.stop_contribution_year ?? 2030,     '停止投入年份', 1900, 2200),
    expected_annual_return: finiteNumber(body.expectedAnnualReturn  ?? body.expected_annual_return ?? 0.16,     '預期年化報酬', -1, 10),
    target_alloc_1x:        finiteNumber(body.targetAlloc1x         ?? body.target_alloc_1x        ?? 70,       '一倍配置', 0, 100),
    target_alloc_2x:        finiteNumber(body.targetAlloc2x         ?? body.target_alloc_2x        ?? 20,       '兩倍配置', 0, 100),
  }

  const { data, error } = await client
    .from('portfolio_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
