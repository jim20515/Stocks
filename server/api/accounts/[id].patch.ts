export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  const { name } = await readBody(event)

  if (!name?.trim()) throw createError({ statusCode: 400, message: '名稱不可空白' })

  const { error } = await client
    .from('portfolio_accounts')
    .update({ name: name.trim() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
