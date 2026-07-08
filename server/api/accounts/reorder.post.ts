// 儲存帳戶自訂順序：接收由前到後排好的 id 陣列，逐一寫入 sort_order（僅限本人帳戶）。
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const { ids } = await readBody(event)

  if (!Array.isArray(ids) || ids.some((id: any) => !Number.isInteger(id))) {
    throw createError({ statusCode: 400, message: '無效的排序資料' })
  }

  // 依陣列索引寫入 sort_order；eq user_id 確保只改自己的帳戶。
  const results = await Promise.all(
    ids.map((id: number, index: number) =>
      client
        .from('portfolio_accounts')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('user_id', userId),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw createError({ statusCode: 500, message: failed.error.message })

  return { success: true }
})
