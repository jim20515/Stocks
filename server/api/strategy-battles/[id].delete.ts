export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '無效的 ID' })

  const { error } = await client
    .from('strategy_battles')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
