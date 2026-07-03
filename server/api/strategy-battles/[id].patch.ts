export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '無效的 ID' })

  const body = await readBody(event)
  const row = parseBattleBody(body)

  const { data, error } = await client
    .from('strategy_battles')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
