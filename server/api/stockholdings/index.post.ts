
export default defineEventHandler(async (event) => {
  const client = useDb()
  const body = await readBody(event)

  const { stockCode, stockName, shares, averageCost, buyDate, leverageMultiplier, watermarkPrice } = body ?? {}
  if (!stockCode || !stockName || !shares || !averageCost || !buyDate) {
    throw createError({ statusCode: 400, message: '缺少必填欄位' })
  }

  const { data, error } = await client
    .from('stock_holdings')
    .insert({
      stock_code: stockCode.trim().toUpperCase(),
      stock_name: stockName.trim(),
      shares: Number(shares),
      average_cost: Number(averageCost),
      buy_date: buyDate,
      leverage_multiplier: Number(leverageMultiplier ?? 1),
      watermark_price: watermarkPrice ? Number(watermarkPrice) : null,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
