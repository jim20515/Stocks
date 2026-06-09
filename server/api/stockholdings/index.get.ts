
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { data, error } = await client
    .from('stock_holdings')
    .select('*')
    .eq('user_id', userId)
    .order('stock_code')

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
