
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) throw createError({ statusCode: 400, message: '無效的 ID' })

  const body = await readBody(event)
  const { stockCode, stockName, shares, averageCost, buyDate, leverageMultiplier, watermarkPrice, account } = body ?? {}

  const { data, error } = await client
    .from('stock_holdings')
    .update({
      stock_code: stockCode.trim().toUpperCase(),
      stock_name: stockName.trim(),
      shares: Number(shares),
      average_cost: Number(averageCost),
      buy_date: buyDate,
      leverage_multiplier: Number(leverageMultiplier ?? 1),
      watermark_price: watermarkPrice ? Number(watermarkPrice) : null,
      account: account?.trim() || null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
