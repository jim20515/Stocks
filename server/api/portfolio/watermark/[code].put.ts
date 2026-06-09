
export default defineEventHandler(async (event) => {
  const client = useDb()
  const code = getRouterParam(event, 'code')?.trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const body = await readBody(event)
  const price = Number(body)
  if (isNaN(price)) throw createError({ statusCode: 400, message: '無效的價格' })

  const { error } = await client
    .from('stock_holdings')
    .update({ watermark_price: price })
    .eq('stock_code', code)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { stockCode: code, watermarkPrice: price }
})
