// 管理員權限檢查（用 service_role 查 app_admins）。
export async function isUserAdmin(userId: string): Promise<boolean> {
  const client = useServiceDb()
  if (!client) return false
  const { data } = await client.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

// 需要管理員：先驗登入，再確認是管理員，否則 403。
export async function requireAdmin(event: any): Promise<string> {
  const userId = await requireUser(event)
  if (!(await isUserAdmin(userId))) {
    throw createError({ statusCode: 403, message: '需要管理員權限' })
  }
  return userId
}
