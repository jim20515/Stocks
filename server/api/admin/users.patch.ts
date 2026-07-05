// 設定/取消某帳號的管理員（管理員限定）。body: { userId, isAdmin }
export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  const body = await readBody(event)
  const userId = String(body?.userId ?? '').trim()
  const makeAdmin = body?.isAdmin === true
  if (!userId) throw createError({ statusCode: 400, message: '缺少 userId' })

  // 避免把自己降級後鎖死
  if (userId === me && !makeAdmin) {
    throw createError({ statusCode: 400, message: '不能取消自己的管理員權限' })
  }

  const client = useServiceDb()
  if (!client) throw createError({ statusCode: 500, message: 'SUPABASE_SERVICE_KEY 未設定' })

  if (makeAdmin) {
    const { error } = await client.from('app_admins').upsert({ user_id: userId }, { onConflict: 'user_id' })
    if (error) throw createError({ statusCode: 500, message: error.message })
  } else {
    const { error } = await client.from('app_admins').delete().eq('user_id', userId)
    if (error) throw createError({ statusCode: 500, message: error.message })
  }

  return { success: true, userId, isAdmin: makeAdmin }
})
