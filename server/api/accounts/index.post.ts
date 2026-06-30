export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { name } = await readBody(event)

  const accountName = String(name ?? '').trim()
  if (!accountName) throw createError({ statusCode: 400, message: '帳戶名稱不能為空' })
  if (accountName.length > 40) throw createError({ statusCode: 400, message: '帳戶名稱過長' })

  const { data, error } = await client
    .from('portfolio_accounts')
    .insert({ user_id: userId, name: accountName })
    .select('id, name')
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
