import fs from 'node:fs'
import path from 'node:path'

export interface SplitRecord {
  id: string | number
  user_id: string
  stock_code: string
  stock_name: string
  split_date: string
  resume_date?: string | null
  ratio: number
  adjust_daily_prices: boolean
  holdings_count: number
  daily_prices_count: number
  status: 'applied' | 'reverted'
  snapshot_data: {
    holdings: Array<{ id: number; shares: number; average_cost: number }>
    dailyPricesCount?: number
    resume_date?: string | null
    snapshots?: Array<{
      date: string
      total_value: number
      total_cost: number
      daily_change: number | null
      daily_change_pct: number | null
      daily_trade_amount: number | null
    }>
  }
  created_at: string
  reverted_at?: string | null
}

const FALLBACK_DIR = path.resolve(process.cwd(), '.data')
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'stock_splits.json')

function readFallbackSplits(): SplitRecord[] {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) fs.mkdirSync(FALLBACK_DIR, { recursive: true })
    if (!fs.existsSync(FALLBACK_FILE)) return []
    const content = fs.readFileSync(FALLBACK_FILE, 'utf-8')
    return JSON.parse(content || '[]')
  } catch {
    return []
  }
}

function writeFallbackSplits(records: SplitRecord[]) {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) fs.mkdirSync(FALLBACK_DIR, { recursive: true })
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(records, null, 2), 'utf-8')
  } catch {}
}

export async function listSplits(client: any, userId: string): Promise<SplitRecord[]> {
  try {
    const { data, error } = await client
      .from('stock_splits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      return data.map((r: any) => ({
        ...r,
        resume_date: r.resume_date ?? r.snapshot_data?.resume_date ?? null,
      }))
    }
  } catch {}

  // Fallback
  const all = readFallbackSplits()
  return all
    .filter(r => r.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(r => ({
      ...r,
      resume_date: r.resume_date ?? r.snapshot_data?.resume_date ?? null,
    }))
}

export async function saveSplitRecord(client: any, record: Omit<SplitRecord, 'id' | 'created_at'>): Promise<SplitRecord> {
  const now = new Date().toISOString()
  let savedRecord: SplitRecord | null = null

  // 確保 snapshot_data 內也同步存一份 resume_date，即使 DB 無欄位也能永久保存
  const enrichedRecord = {
    ...record,
    snapshot_data: {
      ...record.snapshot_data,
      resume_date: record.resume_date ?? null,
    },
  }

  try {
    const insertPayload: any = {
      ...enrichedRecord,
      created_at: now,
    }

    const { data, error } = await client
      .from('stock_splits')
      .insert(insertPayload)
      .select()
      .single()

    if (!error && data) {
      savedRecord = {
        ...data,
        resume_date: data.resume_date ?? enrichedRecord.resume_date,
      }
    } else if (error && (error.message?.includes('resume_date') || error.code === '42703')) {
      // 若 DB 尚未套用 013 migration (無 resume_date 欄位)，移除該鍵後重試
      const { resume_date, ...safePayload } = insertPayload
      const { data: retryData, error: retryErr } = await client
        .from('stock_splits')
        .insert(safePayload)
        .select()
        .single()

      if (!retryErr && retryData) {
        savedRecord = {
          ...retryData,
          resume_date: enrichedRecord.resume_date,
        }
      }
    }
  } catch {}

  if (!savedRecord) {
    const all = readFallbackSplits()
    const newId = Date.now()
    savedRecord = {
      ...enrichedRecord,
      id: newId,
      created_at: now,
    }
    all.unshift(savedRecord)
    writeFallbackSplits(all)
  } else {
    // 雙重備份
    const all = readFallbackSplits()
    all.unshift(savedRecord)
    writeFallbackSplits(all)
  }

  return savedRecord
}

export async function getSplitById(client: any, userId: string, id: string | number): Promise<SplitRecord | null> {
  try {
    const { data, error } = await client
      .from('stock_splits')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!error && data) {
      return {
        ...data,
        resume_date: data.resume_date ?? data.snapshot_data?.resume_date ?? null,
      }
    }
  } catch {}

  const all = readFallbackSplits()
  const found = all.find(r => String(r.id) === String(id) && r.user_id === userId)
  if (!found) return null
  return {
    ...found,
    resume_date: found.resume_date ?? found.snapshot_data?.resume_date ?? null,
  }
}

export async function updateSplitStatus(client: any, userId: string, id: string | number, status: 'applied' | 'reverted'): Promise<void> {
  const revertedAt = status === 'reverted' ? new Date().toISOString() : null

  try {
    await client
      .from('stock_splits')
      .update({
        status,
        reverted_at: revertedAt,
      })
      .eq('id', id)
      .eq('user_id', userId)
  } catch {}

  const all = readFallbackSplits()
  const target = all.find(r => String(r.id) === String(id) && r.user_id === userId)
  if (target) {
    target.status = status
    target.reverted_at = revertedAt
    writeFallbackSplits(all)
  }
}
