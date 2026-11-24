import { adjustTradesForSplits, recordSplitTradeOriginals } from '~~/server/utils/splitTrades'


export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
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

  const row = {
    user_id: userId,
    stock_code: code,
    stock_name: name,
    shares: shareCount,
    average_cost: cost,
    buy_date: tradeDate,
    leverage_multiplier: leverage,
    watermark_price: watermark,
    account: accountName || null,
  }
  // 交易日在已套用分割的基準日以前 → 依分割換算股數與價格
  const adj = await adjustTradesForSplits(client, userId, [row])

  const { data, error } = await client
    .from('stock_holdings')
    .insert(row)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (adj.applied.size) {
    try {
      await recordSplitTradeOriginals(client, userId, adj, [data.id])
    } catch (e: any) {
      adj.notes.push(`（無法記入分割紀錄，之後還原分割時這筆不會一起還原：${e?.message ?? e}）`)
    }
  }
  return { ...data, splitNotes: adj.notes }
})
