
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const payload = {
    user_id:                userId,
    cash_amount:            Number(body.cashAmount            ?? body.cash_amount            ?? 0),
    target_beta:            Number(body.targetBeta            ?? body.target_beta            ?? 1.46),
    start_invest_year:      Number(body.startInvestYear       ?? body.start_invest_year      ?? new Date().getFullYear()),
    initial_age:            Number(body.initialAge            ?? body.initial_age            ?? 30),
    initial_amount:         Number(body.initialAmount         ?? body.initial_amount         ?? 20000000),
    annual_contribution:    Number(body.annualContribution    ?? body.annual_contribution    ?? 5000000),
    stop_contribution_year: Number(body.stopContributionYear  ?? body.stop_contribution_year ?? 2030),
    expected_annual_return: Number(body.expectedAnnualReturn  ?? body.expected_annual_return ?? 0.16),
    target_alloc_1x:        Number(body.targetAlloc1x         ?? body.target_alloc_1x        ?? 70),
    target_alloc_2x:        Number(body.targetAlloc2x         ?? body.target_alloc_2x        ?? 20),
  }

  const { data, error } = await client
    .from('portfolio_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
