
export default defineEventHandler(async (event) => {
  const client = useDb()
  const body = await readBody(event)

  const payload = {
    id: 1,
    birth_year: Number(body.birthYear ?? body.birth_year ?? 1988),
    cash_amount: Number(body.cashAmount ?? body.cash_amount ?? 0),
    target_beta: Number(body.targetBeta ?? body.target_beta ?? 1.46),
    initial_amount: Number(body.initialAmount ?? body.initial_amount ?? 20000000),
    annual_contribution: Number(body.annualContribution ?? body.annual_contribution ?? 5000000),
    stop_contribution_year: Number(body.stopContributionYear ?? body.stop_contribution_year ?? 2030),
    expected_annual_return: Number(body.expectedAnnualReturn ?? body.expected_annual_return ?? 0.16),
  }

  const { data, error } = await client
    .from('portfolio_settings')
    .upsert(payload)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
