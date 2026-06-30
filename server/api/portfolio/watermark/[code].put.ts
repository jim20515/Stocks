
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const code = normalizeStockCode(getRouterParam(event, 'code'))

  const body = await readBody(event)
  const rawPrice = body && typeof body === 'object'
    ? body.price ?? body.watermarkPrice
    : body
  const price = finiteNumber(rawPrice, '水位價', 0, 10_000_000)

  const { data, error } = await client
    .from('stock_holdings')
    .update({ watermark_price: price })
    .eq('stock_code', code)
    .eq('user_id', userId)
    .select('id')

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!data?.length) throw createError({ statusCode: 404, message: '找不到可更新的持股' })
  return { stockCode: code, watermarkPrice: price }
})
