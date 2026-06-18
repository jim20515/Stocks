export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const { data, error } = await client
    .from('portfolio_daily_snapshot')
    .select('date, total_value, daily_change, daily_change_pct, daily_trade_amount')
    .eq('user_id', userId)
    .order('date', { ascending: false })


  if (error) throw createError({ statusCode: 500, message: error.message })

  return data ?? []
})
