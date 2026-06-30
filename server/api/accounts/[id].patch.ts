export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  const { name } = await readBody(event)

  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '無效的 ID' })
  const accountName = String(name ?? '').trim()
  if (!accountName) throw createError({ statusCode: 400, message: '名稱不可空白' })
  if (accountName.length > 40) throw createError({ statusCode: 400, message: '帳戶名稱過長' })

  const { error } = await client
    .from('portfolio_accounts')
    .update({ name: accountName })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
