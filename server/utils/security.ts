const STOCK_CODE_RE = /^\d{4,6}[A-Z]?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const buckets = new Map<string, { count: number; resetAt: number }>()

export function normalizeStockCode(value: unknown): string {
  const code = String(value ?? '').trim().toUpperCase()
  if (!STOCK_CODE_RE.test(code)) {
    throw createError({ statusCode: 400, message: '股票代號格式不正確' })
  }
  return code
}

export function normalizeDate(value: unknown, field = '日期'): string {
  const date = String(value ?? '').trim().replace(/\//g, '-').slice(0, 10)
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) {
    throw createError({ statusCode: 400, message: `${field}格式不正確` })
  }
  return date
}

export function finiteNumber(value: unknown, field: string, min = -Infinity, max = Infinity): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw createError({ statusCode: 400, message: `${field}數值不正確` })
  }
  return number
}

export function checkRateLimit(event: any, key: string, max: number, windowMs: number) {
  const forwarded = String(getHeader(event, 'x-forwarded-for') ?? '').split(',')[0].trim()
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? forwarded ?? 'unknown'
  const bucketKey = `${ip}:${key}`
  const now = Date.now()
  const bucket = buckets.get(bucketKey)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return
  }

  bucket.count++
  if (bucket.count > max) {
    throw createError({ statusCode: 429, message: '操作太頻繁，請稍後再試' })
  }
}
