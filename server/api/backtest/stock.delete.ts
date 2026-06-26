export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const code = String(getQuery(event).code ?? '').trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  // 從自己的追蹤清單移除
  const { error: untrackError } = await client
    .from('user_stock_tracking')
    .delete()
    .eq('user_id', userId)
    .eq('stock_code', code)

  if (untrackError) throw createError({ statusCode: 500, message: untrackError.message })

  // 檢查是否還有其他人追蹤
  const { count, error: countError } = await client
    .from('user_stock_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('stock_code', code)

  if (countError) throw createError({ statusCode: 500, message: countError.message })

  // 沒有人追蹤了，刪除實際資料
  if ((count ?? 0) === 0) {
    await Promise.all([
      client.from('stock_daily_prices').delete().eq('stock_code', code),
      client.from('stock_dividends').delete().eq('stock_code', code),
    ])
  }

  return { code, deleted: true, dataRemoved: (count ?? 0) === 0 }
})
