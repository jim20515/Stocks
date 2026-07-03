export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const row = { ...parseBattleBody(body), user_id: userId }

  const { data, error } = await client
    .from('strategy_battles')
    .insert(row)
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
