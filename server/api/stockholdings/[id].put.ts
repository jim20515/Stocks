
export default defineEventHandler(async (event) => {
  const client = useDb()
  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) throw createError({ statusCode: 400, message: '無效的 ID' })

  const body = await readBody(event)
  const { stockCode, stockName, shares, averageCost, buyDate, leverageMultiplier, watermarkPrice } = body ?? {}

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
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
