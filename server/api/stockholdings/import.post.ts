
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const items: any[] = body?.items ?? []
  if (!items.length) throw createError({ statusCode: 400, message: '無資料' })

  const rows = items.map((h: any) => ({
    user_id: userId,
    stock_code: String(h.stockCode).trim().toUpperCase(),
    stock_name: String(h.stockName).trim(),
    shares: Number(h.shares),
    average_cost: Number(h.averageCost),
    buy_date: h.buyDate,
    leverage_multiplier: Number(h.leverageMultiplier ?? 1),
    watermark_price: h.watermarkPrice ? Number(h.watermarkPrice) : null,
    account: h.account?.trim() || null,
  }))

  const { error } = await client.from('stock_holdings').insert(rows)
  if (error) throw createError({ statusCode: 500, message: error.message })

  return { imported: rows.length }
})
