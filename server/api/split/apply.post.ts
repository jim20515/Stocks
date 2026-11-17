import { normalizeStockCode, normalizeDate, finiteNumber } from '~~/server/utils/security'
import { saveSplitRecord } from '~~/server/utils/splitStorage'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const body = await readBody(event)
  const { stockCode, stockName, splitDate, ratio, adjustDailyPrices } = body ?? {}

  const code = normalizeStockCode(stockCode)
  const sDate = normalizeDate(splitDate, '分割基準日')
  const r = finiteNumber(ratio, '分割倍數', 0.01, 1000)
  const doAdjustPrices = adjustDailyPrices !== false

  // 1. 取得符合條件的持股單據
  const { data: holdings, error: hError } = await client
    .from('stock_holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('stock_code', code)
    .lte('buy_date', sDate)

  if (hError) throw createError({ statusCode: 500, message: hError.message })
  if (!holdings?.length) {
    throw createError({ statusCode: 400, message: `在 ${sDate} 前找不到 ${code} 的任何持股單據` })
  }

  // 2. 建立持股快照（供還原使用）
  const snapshotHoldings = holdings.map((h: any) => ({
    id: h.id,
    shares: h.shares,
    average_cost: Number(h.average_cost),
  }))

  // 3. 更新持股單據 (股數 * r，均價 / r)
  const updatedHoldings = holdings.map((h: any) => ({
    ...h,
    shares: Math.round(h.shares * r),
    average_cost: Math.round((Number(h.average_cost) / r) * 100) / 100,
  }))

  const { error: updateHError } = await client
    .from('stock_holdings')
    .upsert(updatedHoldings)

  if (updateHError) {
    throw createError({ statusCode: 500, message: `持股更新失敗：${updateHError.message}` })
  }

  // 4. 若勾選同步更新歷史收盤價
  let dailyPricesCount = 0
  if (doAdjustPrices) {
    const { data: prices, error: pError } = await client
      .from('stock_daily_prices')
      .select('id, stock_code, date, close_price')
      .eq('stock_code', code)
      .lte('date', sDate)

    if (!pError && prices?.length) {
      dailyPricesCount = prices.length
      const updatedPrices = prices.map((p: any) => ({
        ...p,
        close_price: Math.round((Number(p.close_price) / r) * 100) / 100,
      }))

      // 分批更新 (每批 500 筆)
      const BATCH_SIZE = 500
      for (let i = 0; i < updatedPrices.length; i += BATCH_SIZE) {
        const chunk = updatedPrices.slice(i, i + BATCH_SIZE)
        const { error: chunkError } = await client
          .from('stock_daily_prices')
          .upsert(chunk)
        if (chunkError) {
          console.error('[split] Daily prices upsert error chunk:', chunkError)
        }
      }
    }
  }

  const finalName = String(stockName || holdings[0]?.stock_name || code).trim()

  // 5. 儲存分割紀錄與快照
  const record = await saveSplitRecord(client, {
    user_id: userId,
    stock_code: code,
    stock_name: finalName,
    split_date: sDate,
    ratio: r,
    adjust_daily_prices: doAdjustPrices,
    holdings_count: holdings.length,
    daily_prices_count: dailyPricesCount,
    status: 'applied',
    snapshot_data: {
      holdings: snapshotHoldings,
      dailyPricesCount,
    },
    reverted_at: null,
  })

  return {
    ok: true,
    message: `成功完成 ${code} ${finalName} 1 拆 ${r} 分割！`,
    splitId: record.id,
    holdingsCount: holdings.length,
    dailyPricesCount,
  }
})
