import { getSplitById, updateSplitStatus } from '~~/server/utils/splitStorage'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)

  const body = await readBody(event)
  const { splitId } = body ?? {}
  if (!splitId) throw createError({ statusCode: 400, message: '缺少 splitId' })

  // 1. 取得該筆分割紀錄
  const record = await getSplitById(client, userId, splitId)
  if (!record) {
    throw createError({ statusCode: 404, message: '找不到該筆分割紀錄' })
  }
  if (record.status === 'reverted') {
    throw createError({ statusCode: 400, message: '此分割紀錄先前已經還原過，無法重複還原' })
  }

  // 2. 還原持股 (從 snapshot_data.holdings 還原回原本的 shares 與 average_cost)
  const snapshotHoldings = record.snapshot_data?.holdings || []
  if (snapshotHoldings.length > 0) {
    const ids = snapshotHoldings.map(h => h.id)
    const { data: currentHoldings, error: fetchErr } = await client
      .from('stock_holdings')
      .select('*')
      .in('id', ids)
      .eq('user_id', userId)

    if (!fetchErr && currentHoldings?.length) {
      const holdingMap = new Map(snapshotHoldings.map(s => [s.id, s]))
      const restoredHoldings = currentHoldings.map((ch: any) => {
        const snap = holdingMap.get(ch.id)
        if (!snap) return ch
        return {
          ...ch,
          shares: snap.shares,
          average_cost: snap.average_cost,
        }
      })

      const { error: upsertErr } = await client
        .from('stock_holdings')
        .upsert(restoredHoldings)

      if (upsertErr) {
        throw createError({ statusCode: 500, message: `還原持股失敗：${upsertErr.message}` })
      }
    }
  }

  // 3. 若先前有同步調整歷史日收盤價，將其反向還原 (乘以 ratio)
  if (record.adjust_daily_prices) {
    const { data: prices, error: pError } = await client
      .from('stock_daily_prices')
      .select('id, stock_code, date, close_price')
      .eq('stock_code', record.stock_code)
      .lte('date', record.split_date)

    if (!pError && prices?.length) {
      const r = Number(record.ratio)
      const restoredPrices = prices.map((p: any) => ({
        ...p,
        close_price: Math.round(Number(p.close_price) * r * 100) / 100,
      }))

      const BATCH_SIZE = 500
      for (let i = 0; i < restoredPrices.length; i += BATCH_SIZE) {
        const chunk = restoredPrices.slice(i, i + BATCH_SIZE)
        await client.from('stock_daily_prices').upsert(chunk)
      }
    }
  }

  // 4. 更新狀態為 reverted
  await updateSplitStatus(client, userId, splitId, 'reverted')

  return {
    ok: true,
    message: `已成功還原 ${record.stock_code} 的 1 拆 ${record.ratio} 分割設定！`,
    splitId: record.id,
  }
})
