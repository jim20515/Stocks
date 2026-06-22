
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const { stockCode, stockName, shares, averageCost, buyDate, leverageMultiplier, watermarkPrice, account } = body ?? {}
  if (!stockCode || !stockName || !shares || !averageCost || !buyDate) {
    throw createError({ statusCode: 400, message: '缺少必填欄位' })
  }

  const { data, error } = await client
    .from('stock_holdings')
    .insert({
      user_id: userId,
      stock_code: stockCode.trim().toUpperCase(),
      stock_name: stockName.trim(),
      shares: Number(shares),
      average_cost: Number(averageCost),
      buy_date: buyDate,
      leverage_multiplier: Number(leverageMultiplier ?? 1),
      watermark_price: watermarkPrice ? Number(watermarkPrice) : null,
      account: account?.trim() || null,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
