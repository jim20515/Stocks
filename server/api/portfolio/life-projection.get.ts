export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { data: settings } = await client
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  const currentYear = new Date().getFullYear()

  const s = settings ?? {
    cash_amount: 0, initial_amount: 20000000,
    start_invest_year: currentYear, initial_age: 30,
    annual_contribution: 5000000, stop_contribution_year: 2030,
    expected_annual_return: 0.16,
  }

  const startInvestYear = Number(s.start_invest_year ?? currentYear)
  const initialAge = Number(s.initial_age ?? 30)
  const initialAmount = Number(s.initial_amount ?? 20000000)
  const stopYear = Number(s.stop_contribution_year)
  const rate = Number(s.expected_annual_return)
  const contrib = Number(s.annual_contribution)
  const endYear = startInvestYear + (90 - initialAge)

  let assets = initialAmount
  let totalContrib = 0
  const rows = []

  for (let year = startInvestYear; year <= endYear; year++) {
    const age = initialAge + (year - startInvestYear)
    const interest = Math.round(assets - initialAmount - totalContrib)
    rows.push({
      year, age,
      assets: Math.round(assets),
      starting: initialAmount,
      contributions: Math.round(totalContrib),
      interest: Math.max(0, interest),
    })
    const contribution = year < stopYear ? contrib : 0
    totalContrib += contribution
    assets = (assets + contribution) * (1 + rate)
  }

  return {
    currentYear,
    startInvestYear,
    initialAge,
    settings: {
      startInvestYear,
      initialAge,
      initialAmount,
      annualContribution: contrib,
      stopContributionYear: stopYear,
      expectedAnnualReturn: rate,
    },
    rows,
  }
})
