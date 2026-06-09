
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')?.trim().toUpperCase()
  if (!code) throw createError({ statusCode: 400, message: '請提供股票代號' })

  const result = await lookupStock(code)
  if (!result) throw createError({ statusCode: 404, message: '查無此股票代號' })

  return { code, name: result.name, price: result.price }
})
