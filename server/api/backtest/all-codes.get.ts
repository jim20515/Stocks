export default defineEventHandler(async (event) => {
  await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const { data, error } = await client
    .from('stock_daily_prices')
    .select('stock_code')

  if (error) throw createError({ statusCode: 500, message: error.message })

  const codes = [...new Set((data ?? []).map((r: any) => r.stock_code as string))]
  return { codes }
})
