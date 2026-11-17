import { getSplitById, updateSplitStatus } from '~~/server/utils/splitStorage'
import { restoreSnapshots } from '~~/server/utils/snapshotRecalc'

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
      // 同 apply：id 為 GENERATED ALWAYS identity，只能逐筆 update，不可 upsert 帶 id。
      for (const ch of currentHoldings) {
        const snap: any = holdingMap.get(ch.id)
        if (!snap) continue
        const { error: updateErr } = await client
          .from('stock_holdings')
          .update({ shares: snap.shares, average_cost: snap.average_cost })
          .eq('id', ch.id)
          .eq('user_id', userId)

        if (updateErr) {
          throw createError({ statusCode: 500, message: `還原持股失敗（單據 ${ch.id}）：${updateErr.message}` })
        }
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
      // 移除 id（identity 欄位不可寫入），以 (stock_code,date) 為衝突鍵 upsert
      const restoredPrices = prices.map((p: any) => ({
        stock_code: p.stock_code,
        date: p.date,
        close_price: Math.round(Number(p.close_price) * r * 100) / 100,
      }))

      const BATCH_SIZE = 500
      for (let i = 0; i < restoredPrices.length; i += BATCH_SIZE) {
        const chunk = restoredPrices.slice(i, i + BATCH_SIZE)
        await client.from('stock_daily_prices').upsert(chunk, { onConflict: 'stock_code,date' })
      }
    }
  }

  // 4. 若有儲存原始快照，反向還原快照數值
  const savedSnapshots = record.snapshot_data?.snapshots || []
  if (savedSnapshots.length > 0) {
    try {
      await restoreSnapshots(client, userId, savedSnapshots)
    } catch (err: any) {
      console.error('[split] Snapshot restore error:', err?.message || err)
    }
  }

  // 5. 更新狀態為 reverted
  await updateSplitStatus(client, userId, splitId, 'reverted')

  return {
    ok: true,
    message: `已成功還原 ${record.stock_code} 的 1 拆 ${record.ratio} 分割設定！` + (savedSnapshots.length > 0 ? ` 並同步還原 ${savedSnapshots.length} 筆歷史資產快照。` : ''),
    splitId: record.id,
    snapshotsRestoredCount: savedSnapshots.length,
  }
})
