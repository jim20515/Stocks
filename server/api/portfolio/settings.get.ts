
export default defineEventHandler(async () => {
  const client = useDb()
  const { data } = await client.from('portfolio_settings').select('*').eq('id', 1).single()
  return data ?? {
    id: 1, birth_year: 1988, cash_amount: 0, target_beta: 1.46,
    initial_amount: 20000000, annual_contribution: 5000000,
    stop_contribution_year: 2030, expected_annual_return: 0.16,
    target_alloc_1x: 70, target_alloc_2x: 20,
  }
})
