
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)

  const items: any[] = body?.items ?? []
  if (!items.length) throw createError({ statusCode: 400, message: '無資料' })
  if (items.length > 2_000) throw createError({ statusCode: 400, message: '單次匯入最多 2000 筆' })

  const rows = items.map((h: any) => {
    const name = String(h.stockName ?? '').trim()
    if (!name || name.length > 60) throw createError({ statusCode: 400, message: '匯入資料含無效股票名稱' })
    const shares = finiteNumber(h.shares, '股數', -1_000_000_000, 1_000_000_000)
    if (shares === 0) throw createError({ statusCode: 400, message: '匯入資料含 0 股交易' })
    return {
      user_id: userId,
      stock_code: normalizeStockCode(h.stockCode),
      stock_name: name,
      shares,
      average_cost: finiteNumber(h.averageCost, '成交價格', 0, 10_000_000),
      buy_date: normalizeDate(h.buyDate, '交易日期'),
      leverage_multiplier: finiteNumber(h.leverageMultiplier ?? 1, '持股類型', 0, 2),
      watermark_price: h.watermarkPrice ? finiteNumber(h.watermarkPrice, '水位價', 0, 10_000_000) : null,
      account: h.account ? String(h.account).trim().slice(0, 40) : null,
    }
  })

  const { error } = await client.from('stock_holdings').insert(rows)
  if (error) throw createError({ statusCode: 500, message: error.message })

  return { imported: rows.length }
})
