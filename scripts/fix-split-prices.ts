// 一次性校正：股票分割（拆股）後「沒有還原到」的歷史日線，以及因此灌水的每日快照。
//
// 背景：舊版 split/apply 撈日線時沒有分頁，被 PostgREST 每次 1000 筆截斷，只還原了最早的 1000 筆；
// 舊版「歷史匯入」又會把證交所的原始價蓋回日線表。結果是基準日以前的日線一段已 ÷倍數、一段沒有。
//
// 做法（只看資料庫，不打外部 API）：
//   1. 日線：對每筆「已套用、有還原日線」的分割，在基準日（含）以前找最後一個「相鄰兩日收盤比 ≈ 倍數」的跳點，
//      跳點之後到基準日的價格就是沒還原的那段 → ÷倍數。若整段都沒還原（基準日前後比 ≈ 倍數）則整段 ÷倍數。
//   2. 快照（加 --snapshots-from YYYY-MM-DD）：用 DB 日線（缺價沿用前一筆）與帳戶別 WACC 重算該日起
//      到恢復交易日前一天的 total_value / total_cost / daily_trade_amount / daily_change(_pct)，
//      恢復交易日當天只重算 daily_change(_pct)。
//   套用前會把原值備份成 JSON，可用 --restore 還原。
//
// 用法（Node 22.18+，需 SUPABASE_URL 與 NUXT_SUPABASE_SECRET_KEY / SUPABASE_SERVICE_KEY）：
//   node --env-file=.env scripts/fix-split-prices.ts --code 00662                                  # 預覽
//   node --env-file=.env scripts/fix-split-prices.ts --code 00662 --snapshots-from 2026-11-02 --user <uid>
//   node --env-file=.env scripts/fix-split-prices.ts --code 00662 --snapshots-from 2026-11-02 --user <uid> --apply
//   node --env-file=.env scripts/fix-split-prices.ts --user <uid> --fill-months 2026-10,2026-11 --apply   # 補缺漏日線（只新增，不覆蓋）
//   node --env-file=.env scripts/fix-split-prices.ts --restore backups/split-fix-xxxx.json

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { computeCostBasis, tradeCashFlow } from '../server/utils/costBasis.ts'
import { fetchAllDailyPrices, adjustRawPrice, dedupeSplits } from '../server/utils/splitAdjust.ts'

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
const fmt = (n: number) => Math.round(n).toLocaleString('zh-TW')

interface PriceRow { stock_code: string; date: string; close_price: number }
interface SnapRow {
  user_id: string; date: string; total_value: number; total_cost: number
  daily_change: number | null; daily_change_pct: number | null; daily_trade_amount: number | null
}

async function fetchAll(table: string, select: string, build: (q: any) => any, order: string[]) {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q: any = build(db.from(table).select(select))
    for (const o of order) q = q.order(o, { ascending: true })
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** 找出基準日以前尚未還原的日線 */
function findUnadjusted(rows: PriceRow[], splitDate: string, ratio: number): { rows: PriceRow[]; reason: string } {
  const before = rows.filter(r => r.date <= splitDate)
  const after = rows.filter(r => r.date > splitDate)
  if (!before.length) return { rows: [], reason: '基準日以前沒有日線' }
  const near = (x: number) => x > ratio * 0.8 && x < ratio * 1.25

  let lastJump = -1
  for (let i = 1; i < before.length; i++) {
    const k = Number(before[i].close_price) / Number(before[i - 1].close_price)
    if (near(k)) lastJump = i
  }
  const lastBefore = Number(before[before.length - 1].close_price)
  const firstAfter = after.length ? Number(after[0].close_price) : null
  const boundaryUnadjusted = firstAfter != null && near(lastBefore / firstAfter)

  if (!boundaryUnadjusted) return { rows: [], reason: `基準日前後收盤 ${lastBefore} → ${firstAfter ?? '—'}，看起來已還原` }
  if (lastJump >= 0) {
    return {
      rows: before.slice(lastJump),
      reason: `在 ${before[lastJump - 1].date}（${before[lastJump - 1].close_price}）→ ${before[lastJump].date}（${before[lastJump].close_price}）有 ×${ratio} 跳點，之後到基準日的 ${before.length - lastJump} 筆未還原`,
    }
  }
  return { rows: before, reason: `基準日以前 ${before.length} 筆都未還原` }
}

function parseRoc(rows: any[]): { date: string; close_price: number }[] {
  const out: { date: string; close_price: number }[] = []
  for (const row of rows ?? []) {
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    const parts = String(row[0] ?? '').split('/')
    if (!(close > 0) || parts.length < 3) continue
    out.push({ date: `${parseInt(parts[0]!) + 1911}-${parts[1]!.padStart(2, '0')}-${parts[2]!.padStart(2, '0')}`, close_price: close })
  }
  return out
}

/** 證交所→櫃買抓某月原始收盤價（未還原分割） */
async function fetchRawMonth(code: string, ym: string) {
  const [y, m] = ym.split('-')
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  try {
    const r = await fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${y}${m}01&stockNo=${code}`, { headers })
    const j: any = await r.json()
    if (j?.stat === 'OK' && j.data?.length) return parseRoc(j.data)
  } catch {}
  try {
    const r = await fetch(`https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${Number(y) - 1911}/${m}&stkno=${code}&o=json`, { headers })
    const j: any = await r.json()
    if (j?.aaData?.length) return parseRoc(j.aaData)
  } catch {}
  return []
}

async function restore(file: string) {
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  const prices: PriceRow[] = backup.prices ?? []
  const snaps: SnapRow[] = backup.snapshots ?? []
  const inserted: PriceRow[] = backup.insertedPrices ?? []
  console.log(`還原日線 ${prices.length} 筆、刪除補入日線 ${inserted.length} 筆、快照 ${snaps.length} 筆…`)
  for (const r of inserted) {
    const { error } = await db.from('stock_daily_prices').delete().eq('stock_code', r.stock_code).eq('date', r.date)
    if (error) throw new Error(`刪除補入日線失敗：${error.message}`)
  }
  for (let i = 0; i < prices.length; i += 500) {
    const { error } = await db.from('stock_daily_prices').upsert(prices.slice(i, i + 500), { onConflict: 'stock_code,date' })
    if (error) throw new Error(`還原日線失敗：${error.message}`)
  }
  for (const s of snaps) {
    const { user_id, date, ...patch } = s
    const { error } = await db.from('portfolio_daily_snapshot').update(patch).eq('user_id', user_id).eq('date', date)
    if (error) throw new Error(`還原快照 ${date} 失敗：${error.message}`)
  }
  console.log('還原完成')
}

async function main() {
  const restoreFile = opt('--restore')
  if (restoreFile) return restore(restoreFile)

  const apply = flag('--apply')
  const code = opt('--code')?.toUpperCase()
  const snapsFrom = opt('--snapshots-from')
  const onlyUser = opt('--user')
  if (snapsFrom && !onlyUser) throw new Error('重算快照需要指定 --user')

  // 注意：要先跑完「日線 ÷倍數」校正再補缺漏，否則補入的已還原價格會在未還原段落中製造假跳點
  const fillMonths = opt('--fill-months')
  if (fillMonths) {
    if (!onlyUser) throw new Error('補日線需要指定 --user（補該使用者在這些月份有持股的代號）')
    const months = fillMonths.split(',').map(x => x.trim()).filter(Boolean)
    const holdings = await fetchAll('stock_holdings', 'stock_code, shares, buy_date', q => q.eq('user_id', onlyUser), ['buy_date'])
    const lastDay = months.map(ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y!, m!, 0).getDate()).padStart(2, '0')}` }).sort().pop()!
    const codes = [...new Set(holdings.filter((h: any) => h.buy_date <= lastDay).map((h: any) => String(h.stock_code).toUpperCase()))]
    const splitRows = await fetchAll('stock_splits', 'stock_code, split_date, ratio', q => q.eq('status', 'applied').eq('adjust_daily_prices', true), ['id'])
    const priceSplits = dedupeSplits(splitRows.map((r: any) => ({ stock_code: String(r.stock_code), split_date: String(r.split_date), ratio: Number(r.ratio) })))
    const toInsert: PriceRow[] = []
    for (const code of codes) {
      for (const ym of months) {
        const [yy, mm] = ym.split('-').map(Number)
        const monthEnd = `${ym}-${String(new Date(yy!, mm!, 0).getDate()).padStart(2, '0')}`
        const existing = new Set((await fetchAllDailyPrices(db, code, { from: `${ym}-01`, to: monthEnd })).map(r => r.date))
        const raw = await fetchRawMonth(code, ym)
        await new Promise(r => setTimeout(r, 1200)) // 證交所有頻率限制
        const missing = raw.filter(r => !existing.has(r.date))
          .map(r => ({ stock_code: code, date: r.date, close_price: adjustRawPrice(priceSplits, code, r.date, r.close_price) }))
        if (missing.length) console.log(`  ${code} ${ym}：DB ${existing.size} 筆、來源 ${raw.length} 筆，缺 ${missing.length} 筆（${missing.map(m => `${m.date.slice(5)} ${m.close_price}`).join('、')}）`)
        else if (!raw.length) console.log(`  ${code} ${ym}：證交所／櫃買都抓不到資料`)
        toInsert.push(...missing)
      }
    }
    if (!apply) return console.log(`\n預覽完成：要補入日線 ${toInsert.length} 筆（未寫入）。加 --apply 才會寫入。`)
    if (!toInsert.length) return console.log('沒有缺漏的日線')
    mkdirSync('backups', { recursive: true })
    const file = `backups/split-fill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), insertedPrices: toInsert }, null, 2))
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await db.from('stock_daily_prices').upsert(toInsert.slice(i, i + 500), { onConflict: 'stock_code,date', ignoreDuplicates: true })
      if (error) throw new Error(`補入日線失敗：${error.message}。可用 --restore ${file} 移除已補入的資料`)
    }
    return console.log(`已補入日線 ${toInsert.length} 筆（記錄於 ${file}，可用 --restore 移除）`)
  }

  const splits = await fetchAll('stock_splits', 'id, user_id, stock_code, split_date, ratio, adjust_daily_prices, status, snapshot_data',
    q => {
      let x = q.eq('status', 'applied').eq('adjust_daily_prices', true)
      if (code) x = x.eq('stock_code', code)
      return x
    }, ['id'])
  if (!splits.length) return console.log('找不到已套用的分割紀錄')

  // 同代號同基準日只處理一次
  const uniq = new Map<string, any>()
  for (const s of splits) uniq.set(`${s.stock_code}|${s.split_date}`, s)

  // ── 1. 日線 ──
  const priceBackup: PriceRow[] = []
  const priceFixes: PriceRow[] = []
  const fixedPrices = new Map<string, Map<string, number>>() // code → date → 修正後價格（快照重算用）
  for (const s of uniq.values()) {
    const ratio = Number(s.ratio)
    const rows = (await fetchAllDailyPrices(db, s.stock_code)).map(r => ({ ...r, close_price: Number(r.close_price) }))
    const { rows: bad, reason } = findUnadjusted(rows, s.split_date, ratio)
    console.log(`${s.stock_code} 基準日 ${s.split_date} 1 拆 ${ratio}：日線共 ${rows.length} 筆；${reason}`)
    if (bad.length) {
      console.log(`  將 ÷${ratio}：${bad[0].date}（${bad[0].close_price} → ${Math.round(bad[0].close_price / ratio * 100) / 100}）～ ${bad[bad.length - 1].date}（${bad[bad.length - 1].close_price} → ${Math.round(bad[bad.length - 1].close_price / ratio * 100) / 100}）`)
    }
    const m = new Map(rows.map(r => [r.date, r.close_price]))
    for (const r of bad) {
      priceBackup.push({ stock_code: r.stock_code, date: r.date, close_price: r.close_price })
      const v = Math.round((r.close_price / ratio) * 100) / 100
      priceFixes.push({ stock_code: r.stock_code, date: r.date, close_price: v })
      m.set(r.date, v)
    }
    fixedPrices.set(s.stock_code, m)
  }

  // ── 2. 快照 ──
  const snapBackup: SnapRow[] = []
  const snapFixes: SnapRow[] = []
  if (snapsFrom && onlyUser) {
    const userSplits = splits.filter(s => s.user_id === onlyUser)
    // 線上 stock_splits 可能沒有 resume_date 欄位（013 migration 未套用），一律讀 snapshot_data 內的備份
    const resume = userSplits.map(s => s.snapshot_data?.resume_date).filter(Boolean).sort()[0] as string | undefined
    if (!resume) throw new Error('分割紀錄沒有恢復交易日，無法決定快照重算範圍')

    const holdings = await fetchAll('stock_holdings', 'id, stock_code, shares, average_cost, account, buy_date', q => q.eq('user_id', onlyUser), ['buy_date', 'id'])
    const allSnaps: SnapRow[] = await fetchAll('portfolio_daily_snapshot', 'user_id, date, total_value, total_cost, daily_change, daily_change_pct, daily_trade_amount',
      q => q.eq('user_id', onlyUser), ['date'])
    const codes = [...new Set(holdings.map((h: any) => String(h.stock_code).toUpperCase()))]
    const priceMap = new Map<string, Map<string, number>>()
    const lookbackFrom = new Date(new Date(snapsFrom).getTime() - 60 * 86400000).toISOString().slice(0, 10)
    for (const c of codes) {
      const m = fixedPrices.get(c) ?? new Map((await fetchAllDailyPrices(db, c, { from: lookbackFrom })).map(r => [r.date, Number(r.close_price)]))
      priceMap.set(c, m)
    }
    const priceOn = (c: string, d: string) => {
      const m = priceMap.get(c)
      if (!m) return null
      let best: string | null = null
      for (const k of m.keys()) if (k <= d && (!best || k > best)) best = k
      return best ? m.get(best)! : null
    }
    const valueOn = (d: string) => {
      const { ledger } = computeCostBasis(holdings.filter((h: any) => h.buy_date <= d))
      let v = 0
      for (const p of ledger.open()) {
        const px = priceOn(p.code, d)
        v += (px && px > 0 ? px : p.totalCost / p.totalShares) * p.totalShares
      }
      return { value: Math.round(v), cost: Math.round(ledger.totalCost()) }
    }

    // 對照：重算起點前 3 筆（不寫入），確認算法與既有快照一致
    const idxFrom = allSnaps.findIndex(s => s.date >= snapsFrom)
    console.log(`\n快照對照（起點前 3 筆，只顯示不寫入）：`)
    for (const s of allSnaps.slice(Math.max(0, idxFrom - 3), idxFrom)) {
      const { value, cost } = valueOn(s.date)
      console.log(`  ${s.date} 市值 現存 ${fmt(s.total_value)} / 重算 ${fmt(value)}；成本 現存 ${fmt(s.total_cost)} / 重算 ${fmt(cost)}`)
    }

    console.log(`\n快照重算 ${snapsFrom} ～ ${resume}（恢復交易日只重算漲跌）：`)
    let prevValue: number | null = idxFrom > 0 ? Number(allSnaps[idxFrom - 1].total_value) : null
    for (const s of allSnaps.slice(idxFrom)) {
      if (s.date > resume) break
      const dayTrades = holdings.filter((h: any) => h.buy_date === s.date)
      const flow = tradeCashFlow(dayTrades)
      let next: SnapRow
      if (s.date < resume) {
        const { value, cost } = valueOn(s.date)
        next = { ...s, total_value: value, total_cost: cost, daily_trade_amount: Math.round(flow) }
      } else {
        next = { ...s, total_value: Number(s.total_value) }
      }
      const change = prevValue != null ? Math.round(next.total_value - prevValue - flow) : 0
      next.daily_change = change
      next.daily_change_pct = prevValue && prevValue > 0 ? Math.round(change / prevValue * 10000) / 100 : null
      snapBackup.push({
        user_id: s.user_id, date: s.date, total_value: Number(s.total_value), total_cost: Number(s.total_cost),
        daily_change: s.daily_change, daily_change_pct: s.daily_change_pct, daily_trade_amount: s.daily_trade_amount,
      })
      snapFixes.push(next)
      console.log(`  ${s.date} 市值 ${fmt(s.total_value)} → ${fmt(next.total_value)}；成本 ${fmt(s.total_cost)} → ${fmt(next.total_cost)}；漲跌 ${fmt(s.daily_change ?? 0)}（${s.daily_change_pct ?? '—'}%）→ ${fmt(change)}（${next.daily_change_pct ?? '—'}%）`)
      prevValue = next.total_value
    }
  }

  if (!apply) {
    console.log(`\n預覽完成：日線 ${priceFixes.length} 筆、快照 ${snapFixes.length} 筆需校正（未寫入）。加 --apply 才會備份並寫入。`)
    return
  }
  if (!priceFixes.length && !snapFixes.length) return console.log('沒有需要校正的資料')

  mkdirSync('backups', { recursive: true })
  const file = `backups/split-fix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), prices: priceBackup, snapshots: snapBackup }, null, 2))
  console.log(`\n已備份原值到 ${file}`)

  for (let i = 0; i < priceFixes.length; i += 500) {
    const { error } = await db.from('stock_daily_prices').upsert(priceFixes.slice(i, i + 500), { onConflict: 'stock_code,date' })
    if (error) throw new Error(`日線寫入失敗（第 ${i} 筆起）：${error.message}。可用 --restore ${file} 還原`)
  }
  for (const s of snapFixes) {
    const { user_id, date, ...patch } = s
    const { error } = await db.from('portfolio_daily_snapshot').update(patch).eq('user_id', user_id).eq('date', date)
    if (error) throw new Error(`快照 ${date} 寫入失敗：${error.message}。可用 --restore ${file} 還原`)
  }
  console.log(`已校正日線 ${priceFixes.length} 筆、快照 ${snapFixes.length} 筆。若要還原：node --env-file=.env scripts/fix-split-prices.ts --restore ${file}`)
}

main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
