
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { data } = await client
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data ?? {
    user_id: userId, cash_amount: 0, target_beta: 1.46,
    start_invest_year: new Date().getFullYear(), initial_age: 30,
    initial_amount: 20000000, annual_contribution: 5000000,
    stop_contribution_year: 2030, expected_annual_return: 0.16,
    target_alloc_1x: 70, target_alloc_2x: 20,
  }
})
