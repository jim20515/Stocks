
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const code = normalizeStockCode(getRouterParam(event, 'code'))
  checkRateLimit(event, `lookup:${code}`, 60, 60 * 1000)

  const result = await lookupStock(code)
  if (!result) throw createError({ statusCode: 404, message: '查無此股票代號' })

  return { code, name: result.name, price: result.price }
})
