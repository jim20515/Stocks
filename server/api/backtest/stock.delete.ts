export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const code = normalizeStockCode(getQuery(event).code)

  // 從自己的追蹤清單移除
  const { error: untrackError } = await client
    .from('user_stock_tracking')
    .delete()
    .eq('user_id', userId)
    .eq('stock_code', code)

  if (untrackError) throw createError({ statusCode: 500, message: untrackError.message })

  // 價格與配息資料是全站共用快取，不由單一使用者移除，避免 RLS 視角誤判造成他人資料被刪。
  return { code, deleted: true, dataRemoved: false }
})
