export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const { error } = await client
    .from('stock_holdings')
    .delete()
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
