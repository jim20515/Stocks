// 一次性校正：依「各帳戶各自 WACC」重算 portfolio_daily_snapshot 歷史的 total_cost
// （舊版排程快照用跨帳戶合併成本寫入，多帳戶且有賣出的日子會偏高／偏低）。
//
// 只改 total_cost（加 --trade-amount 時一併校正 daily_trade_amount），市值與漲跌欄位不動。
// 套用前會先把要改的原值備份成 JSON，可用 --restore 還原。
//
// 用法（Node 22.18+，需 SUPABASE_URL 與 NUXT_SUPABASE_SECRET_KEY / SUPABASE_SERVICE_KEY）：
//   node --env-file=.env scripts/fix-snapshot-total-cost.ts                 # 預覽（不寫入）
//   node --env-file=.env scripts/fix-snapshot-total-cost.ts --apply         # 備份後寫入
//   node --env-file=.env scripts/fix-snapshot-total-cost.ts --apply --trade-amount
//   node --env-file=.env scripts/fix-snapshot-total-cost.ts --restore backups/snapshot-cost-xxxx.json
//   可加 --user <user_id> 只處理單一使用者

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { CostLedger, sortTrades, tradeCashFlow } from '../server/utils/costBasis.ts'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const url = process.env.SUPABASE_URL
const key = process.env.NUXT_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('缺少 SUPABASE_URL 或 NUXT_SUPABASE_SECRET_KEY / SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

interface BackupRow {
  user_id: string
  date: string
  total_cost: number | null
  daily_trade_amount: number | null
}

async function fetchAll(table: string, select: string, order: string[], userId?: string) {
  const out: any[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q: any = db.from(table).select(select)
    if (userId) q = q.eq('user_id', userId)
    for (const o of order) q = q.order(o, { ascending: true })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function updateRow(r: { user_id: string; date: string }, patch: Record<string, number | null>) {
  const { error } = await db.from('portfolio_daily_snapshot').update(patch).eq('user_id', r.user_id).eq('date', r.date)
  if (error) throw new Error(`更新 ${r.user_id} ${r.date} 失敗：${error.message}`)
}

async function restore(file: string) {
  const rows: BackupRow[] = JSON.parse(readFileSync(file, 'utf8')).rows
  console.log(`還原 ${rows.length} 筆快照…`)
  for (const r of rows) await updateRow(r, { total_cost: r.total_cost, daily_trade_amount: r.daily_trade_amount })
  console.log('還原完成')
}

async function main() {
  const restoreFile = opt('--restore')
  if (restoreFile) return restore(restoreFile)

  const apply = flag('--apply')
  const fixTrade = flag('--trade-amount')
  const onlyUser = opt('--user')

  const holdings = await fetchAll('stock_holdings', 'id, user_id, stock_code, shares, average_cost, account, buy_date', ['user_id', 'buy_date', 'id'], onlyUser)
  const snaps = await fetchAll('portfolio_daily_snapshot', 'user_id, date, total_cost, daily_trade_amount', ['user_id', 'date'], onlyUser)

  const tradesByUser: Record<string, any[]> = {}
  for (const h of holdings) (tradesByUser[h.user_id] ??= []).push(h)
  const snapsByUser: Record<string, any[]> = {}
  for (const s of snaps) (snapsByUser[s.user_id] ??= []).push(s)

  const changes: { user_id: string; date: string; old: BackupRow; total_cost: number; daily_trade_amount: number }[] = []

  for (const [userId, userSnaps] of Object.entries(snapsByUser)) {
    const trades = sortTrades(tradesByUser[userId] ?? [])
    const ledger = new CostLedger()
    let i = 0
    let userChanged = 0
    let maxDiff = 0
    for (const s of userSnaps) {
      const dayTrades: any[] = []
      while (i < trades.length && String(trades[i].buy_date) <= s.date) {
        ledger.apply(trades[i])
        dayTrades.push(trades[i++])
      }
      const newCost = Math.round(ledger.totalCost())
      const newTrade = Math.round(tradeCashFlow(dayTrades))
      const oldCost = s.total_cost != null ? Number(s.total_cost) : null
      const oldTrade = s.daily_trade_amount != null ? Number(s.daily_trade_amount) : null
      const costDiff = oldCost == null || Math.abs(newCost - oldCost) > 1
      const tradeDiff = fixTrade && (oldTrade == null || Math.abs(newTrade - oldTrade) > 1)
      if (costDiff || tradeDiff) {
        changes.push({
          user_id: userId,
          date: s.date,
          old: { user_id: userId, date: s.date, total_cost: oldCost, daily_trade_amount: oldTrade },
          total_cost: newCost,
          daily_trade_amount: fixTrade ? newTrade : (oldTrade ?? 0),
        })
        userChanged++
        maxDiff = Math.max(maxDiff, Math.abs(newCost - (oldCost ?? 0)))
      }
    }
    console.log(`使用者 ${userId}：快照 ${userSnaps.length} 筆，需校正 ${userChanged} 筆，total_cost 最大差異 ${maxDiff.toLocaleString('zh-TW')}`)
  }

  for (const c of changes.slice(0, 20)) {
    console.log(`  ${c.date}  total_cost ${c.old.total_cost} → ${c.total_cost}` + (fixTrade ? `  daily_trade_amount ${c.old.daily_trade_amount} → ${c.daily_trade_amount}` : ''))
  }
  if (changes.length > 20) console.log(`  …另有 ${changes.length - 20} 筆`)

  if (!apply) {
    console.log(`\n預覽完成，共 ${changes.length} 筆需校正（未寫入）。加 --apply 才會備份並寫入。`)
    return
  }
  if (!changes.length) return console.log('沒有需要校正的快照')

  mkdirSync('backups', { recursive: true })
  const file = `backups/snapshot-cost-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), rows: changes.map(c => c.old) }, null, 2))
  console.log(`\n已備份原值到 ${file}`)

  for (const c of changes) {
    const patch: Record<string, number> = { total_cost: c.total_cost }
    if (fixTrade) patch.daily_trade_amount = c.daily_trade_amount
    await updateRow(c, patch)
  }
  console.log(`已校正 ${changes.length} 筆。若要還原：node --env-file=.env scripts/fix-snapshot-total-cost.ts --restore ${file}`)
}

main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
