export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { name } = await readBody(event)

  if (!name?.trim()) throw createError({ statusCode: 400, message: '帳戶名稱不能為空' })

  const { data, error } = await client
    .from('portfolio_accounts')
    .insert({ user_id: userId, name: name.trim() })
    .select('id, name')
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
