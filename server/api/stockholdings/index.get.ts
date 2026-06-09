
export default defineEventHandler(async (event) => {
  const client = useDb()
  const { data, error } = await client
    .from('stock_holdings')
    .select('*')
    .order('stock_code')

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
