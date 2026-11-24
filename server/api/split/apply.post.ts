import { normalizeStockCode, normalizeDate, finiteNumber } from '~~/server/utils/security'
import { saveSplitRecord, listSplits } from '~~/server/utils/splitStorage'
import { recalculateSnapshots } from '~~/server/utils/snapshotRecalc'
import { scaleDailyPrices, countOtherPriceSplits } from '~~/server/utils/splitAdjust'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  // 共用日線表的寫入與「其他使用者是否已還原過」的查詢需要跨使用者，用 service client；未設定時退回使用者身分
  const priceClient = useServiceDb() ?? client

  const body = await readBody(event)
  const { stockCode, stockName, splitDate, resumeDate, ratio, adjustDailyPrices } = body ?? {}

  const code = normalizeStockCode(stockCode)
  const sDate = normalizeDate(splitDate, '分割基準日')
  const rDate = resumeDate ? normalizeDate(resumeDate, '新股恢復交易日') : null
  const r = finiteNumber(ratio, '分割倍數', 0.01, 1000)
  const doAdjustPrices = adjustDailyPrices !== false
  if (rDate && rDate <= sDate) {
    throw createError({ statusCode: 400, message: '新股恢復交易日必須晚於分割基準日' })
  }

  // 0-1. 停止交易期間報價仍是分割前的舊價，若此時就把股數 ×倍數，總覽與每日快照會灌水，所以要等恢復交易後再套用
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  if (rDate ? today < rDate : today <= sDate) {
    throw createError({
      statusCode: 400,
      message: rDate
        ? `新股 ${rDate} 才恢復交易，停止交易期間報價仍是分割前價格，請於 ${rDate} 當天或之後再執行分割`
        : '請於分割基準日之後（新股恢復交易後）再執行分割',
    })
  }

  // 0-2. 防止同一個分割被重複套用（會變成 ×ratio²）
  const existing = await listSplits(client, userId)
  const dup = existing.find(s => s.status === 'applied' && s.stock_code === code && s.split_date === sDate)
  if (dup) {
    throw createError({ statusCode: 400, message: `${code} 在 ${sDate} 的分割已經套用過（紀錄 #${dup.id}），如需重做請先還原` })
  }

  // 1. 取得符合條件的持股單據
  const { data: holdings, error: hError } = await client
    .from('stock_holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('stock_code', code)
    .lte('buy_date', sDate)
    .order('id')
    .range(0, 9999)

  if (hError) throw createError({ statusCode: 500, message: hError.message })
  if (!holdings?.length) {
    throw createError({ statusCode: 400, message: `在 ${sDate} 前找不到 ${code} 的任何持股單據` })
  }

  // 2. 建立持股快照（供還原使用）
  const snapshotHoldings = holdings.map((h: any) => ({
    id: h.id,
    shares: h.shares,
    average_cost: Number(h.average_cost),
    watermark_price: h.watermark_price != null ? Number(h.watermark_price) : null,
  }))

  // 3. 先還原共用日線（失敗就中止，避免持股已 ×倍數 但價格沒還原）
  //    同代號同基準日若已有其他使用者的分割紀錄還原過日線，就不能再除一次。
  let dailyPricesCount = 0
  let pricesNote = ''
  if (doAdjustPrices) {
    try {
      const others = await countOtherPriceSplits(priceClient, code, sDate)
      if (others > 0) {
        pricesNote = ' 歷史日線先前已還原過，本次不重複調整。'
      } else {
        dailyPricesCount = await scaleDailyPrices(priceClient, code, sDate, 1 / r)
      }
    } catch (err: any) {
      throw createError({ statusCode: 500, message: `歷史日線還原失敗，分割未執行：${err?.message ?? err}` })
    }
  }

  // 4. 更新持股單據 (股數 * r，均價 / r，水位價 / r)
  // 注意：stock_holdings.id 為 GENERATED ALWAYS AS IDENTITY，Postgres 禁止 INSERT 指定 id，
  // 因此不能用 upsert 帶 id 寫回，必須以 id 條件逐筆 update。
  for (const h of holdings as any[]) {
    const patch: Record<string, number | null> = {
      shares: Math.round(h.shares * r),
      average_cost: Math.round((Number(h.average_cost) / r) * 100) / 100,
    }
    if (h.watermark_price != null) patch.watermark_price = Math.round((Number(h.watermark_price) / r) * 100) / 100
    const { error: updateHError } = await client
      .from('stock_holdings')
      .update(patch)
      .eq('id', h.id)
      .eq('user_id', userId)

    if (updateHError) {
      throw createError({
        statusCode: 500,
        message: `持股更新失敗（單據 ${h.id}）：${updateHError.message}。` +
          (dailyPricesCount ? `注意：歷史日線已還原 ${dailyPricesCount} 筆，請聯絡管理員處理。` : ''),
      })
    }
  }

  // 5. 自動重算受影響的每日快照（從恢復交易日或基準日起）
  const effectiveResumeDate = rDate || sDate
  let snapshotsAdjustedCount = 0
  let savedSnapshots: any[] = []
  let snapshotsNote = ''

  try {
    const recalcRes = await recalculateSnapshots(client, userId, effectiveResumeDate)
    snapshotsAdjustedCount = recalcRes.updatedCount
    savedSnapshots = recalcRes.savedSnapshots
  } catch (err: any) {
    console.error('[split] Snapshots recalculation error:', err?.message || err)
    snapshotsNote = ` 每日快照重算失敗（${err?.message || err}），請到每日漲幅頁重新匯入。`
  }

  const finalName = String(stockName || holdings[0]?.stock_name || code).trim()

  // 6. 儲存分割紀錄與快照
  const record = await saveSplitRecord(client, {
    user_id: userId,
    stock_code: code,
    stock_name: finalName,
    split_date: sDate,
    resume_date: rDate,
    ratio: r,
    adjust_daily_prices: doAdjustPrices,
    holdings_count: holdings.length,
    daily_prices_count: dailyPricesCount,
    status: 'applied',
    snapshot_data: {
      holdings: snapshotHoldings,
      dailyPricesCount,
      resume_date: rDate,
      snapshots: savedSnapshots,
    },
    reverted_at: null,
  })

  return {
    ok: true,
    message: `成功完成 ${code} ${finalName} 1 拆 ${r} 分割！` +
      (dailyPricesCount > 0 ? ` 已還原 ${dailyPricesCount} 筆歷史日線。` : '') +
      pricesNote +
      (snapshotsAdjustedCount > 0 ? ` 已同步校正 ${snapshotsAdjustedCount} 筆每日資產快照。` : '') +
      snapshotsNote,
    splitId: record.id,
    holdingsCount: holdings.length,
    dailyPricesCount,
    snapshotsAdjustedCount,
  }
})
