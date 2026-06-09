
export default defineEventHandler(async (event) => {
  const client = useDb()

  const [{ data: settings }, { data: holdings }] = await Promise.all([
    client.from('portfolio_settings').select('*').eq('id', 1).single(),
    client.from('stock_holdings').select('*'),
  ])

  const s = settings ?? {
    birth_year: 1988, cash_amount: 0, initial_amount: 20000000,
    annual_contribution: 5000000, stop_contribution_year: 2030,
    expected_annual_return: 0.16,
  }

  const codes = [...new Set((holdings ?? []).map(h => h.stock_code))]
  const prices = await fetchPrices(codes)

  const stockValue = (holdings ?? []).reduce((sum, h) => {
    const p = prices[h.stock_code.toUpperCase()] ?? Number(h.average_cost)
    return sum + p * h.shares
  }, 0)

  const currentAssets = stockValue + Number(s.cash_amount)
  const currentYear = new Date().getFullYear()
  const birthYear = Number(s.birth_year)
  const stopYear = Number(s.stop_contribution_year)
  const rate = Number(s.expected_annual_return)
  const contrib = Number(s.annual_contribution)

  let assets = currentAssets > 0 ? currentAssets : Number(s.initial_amount)
  const rows = []

  for (let year = currentYear; year <= birthYear + 80; year++) {
    rows.push({ year, age: year - birthYear, assets: Math.round(assets) })
    const contribution = year < stopYear ? contrib : 0
    assets = (assets + contribution) * (1 + rate)
  }

  return {
    currentYear,
    currentAge: currentYear - birthYear,
    currentAssets: Math.round(currentAssets),
    settings: {
      birthYear,
      annualContribution: contrib,
      stopContributionYear: stopYear,
      expectedAnnualReturn: rate,
    },
    rows,
  }
})
