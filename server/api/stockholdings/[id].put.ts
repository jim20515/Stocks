
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) throw createError({ statusCode: 400, message: '無效的 ID' })

  const body = await readBody(event)
  const { stockCode, stockName, shares, averageCost, buyDate, leverageMultiplier, watermarkPrice, account } = body ?? {}
  if (!stockCode || !stockName || !shares || !averageCost || !buyDate) {
    throw createError({ statusCode: 400, message: '缺少必填欄位' })
  }
  const code = normalizeStockCode(stockCode)
  const name = String(stockName).trim()
  if (!name || name.length > 60) throw createError({ statusCode: 400, message: '股票名稱格式不正確' })
  const shareCount = finiteNumber(shares, '股數', -1_000_000_000, 1_000_000_000)
  if (shareCount === 0) throw createError({ statusCode: 400, message: '股數不能為 0' })
  const cost = finiteNumber(averageCost, '成交價格', 0, 10_000_000)
  const tradeDate = normalizeDate(buyDate, '交易日期')
  const leverage = finiteNumber(leverageMultiplier ?? 1, '持股類型', 0, 2)
  const watermark = watermarkPrice ? finiteNumber(watermarkPrice, '水位價', 0, 10_000_000) : null
  const accountName = account ? String(account).trim().slice(0, 40) : null

  const { data, error } = await client
    .from('stock_holdings')
    .update({
      stock_code: code,
      stock_name: name,
      shares: shareCount,
      average_cost: cost,
      buy_date: tradeDate,
      leverage_multiplier: leverage,
      watermark_price: watermark,
      account: accountName || null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
