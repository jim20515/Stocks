import fs from 'node:fs'
import path from 'node:path'

export interface SplitRecord {
  id: string | number
  user_id: string
  stock_code: string
  stock_name: string
  split_date: string
  ratio: number
  adjust_daily_prices: boolean
  holdings_count: number
  daily_prices_count: number
  status: 'applied' | 'reverted'
  snapshot_data: {
    holdings: Array<{ id: number; shares: number; average_cost: number }>
    dailyPricesCount?: number
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
      return data
    }
  } catch {}

  // Fallback
  const all = readFallbackSplits()
  return all.filter(r => r.user_id === userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function saveSplitRecord(client: any, record: Omit<SplitRecord, 'id' | 'created_at'>): Promise<SplitRecord> {
  const now = new Date().toISOString()
  let savedRecord: SplitRecord | null = null

  try {
    const { data, error } = await client
      .from('stock_splits')
      .insert({
        ...record,
        created_at: now,
      })
      .select()
      .single()

    if (!error && data) {
      savedRecord = data
    }
  } catch {}

  if (!savedRecord) {
    const all = readFallbackSplits()
    const newId = Date.now()
    savedRecord = {
      ...record,
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

    if (!error && data) return data
  } catch {}

  const all = readFallbackSplits()
  return all.find(r => String(r.id) === String(id) && r.user_id === userId) ?? null
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
