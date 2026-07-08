export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const { data, error } = await client
    .from('portfolio_accounts')
    .select('*')
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, message: error.message })

  // 依自訂順序 sort_order 排序（未設定者排最後，再以建立時間為次序）。
  // 用 JS 排序而非 SQL，讓 sort_order 欄位尚未建立（migration 未跑）時也不會壞。
  const rows = (data ?? []).slice().sort((a: any, b: any) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
  return rows.map((r: any) => ({ id: r.id, name: r.name }))
})
