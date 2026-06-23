export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const { data, error } = await client
    .from('portfolio_accounts')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at')

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data ?? []
})
