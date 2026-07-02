// server/api/backtest/history.post.ts 內的純函式測試
// toMonthKey, addMonth, getMonthEnd, parseTwseRows 是 module-private
// 我們直接在測試檔裡複製這些純邏輯做單元測試（它們只是日期運算，不依賴外部狀態）

import { describe, it, expect } from 'vitest'

// ---------- 從 history.post.ts 複製的純函式（避免 import handler 觸發 Nitro auto-import） ----------

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function addMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function getMonthEnd(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function parseTwseRows(code: string, rows: any[] = []) {
  type DailyPrice = { date: string; close_price: number }
  const result: DailyPrice[] = []
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    const date = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    result.push({ date, close_price: close })
  }
  return result
}

function parseTpexRows(code: string, rows: any[] = []) {
  type DailyPrice = { date: string; close_price: number }
  const result: DailyPrice[] = []
  for (const row of rows) {
    const dateRaw = row[0] as string
    const close = parseFloat(String(row[6] ?? '').replace(/,/g, ''))
    if (isNaN(close) || close <= 0) continue
    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    const date = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    result.push({ date, close_price: close })
  }
  return result
}

function parseYahooRows(resp: any) {
  type DailyPrice = { date: string; close_price: number }
  const result: DailyPrice[] = []
  const item = resp?.chart?.result?.[0]
  const timestamps = item?.timestamp ?? []
  const closes = item?.indicators?.quote?.[0]?.close ?? []

  for (let i = 0; i < timestamps.length; i++) {
    const close = Number(closes[i])
    if (!Number.isFinite(close) || close <= 0) continue
    const date = new Date(timestamps[i] * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    result.push({ date, close_price: close })
  }

  return result
}

// ---------- 測試 ----------

describe('toMonthKey', () => {
  it('一月', () => {
    expect(toMonthKey(new Date(2024, 0, 15))).toBe('2024-01')
  })
  it('十二月', () => {
    expect(toMonthKey(new Date(2024, 11, 1))).toBe('2024-12')
  })
  it('月份補零', () => {
    expect(toMonthKey(new Date(2024, 2, 1))).toBe('2024-03')
  })
})

describe('addMonth', () => {
  it('一般月份加一', () => {
    const result = addMonth(new Date(2024, 5, 15))
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(6) // July
    expect(result.getDate()).toBe(1)
  })
  it('跨年', () => {
    const result = addMonth(new Date(2024, 11, 15))
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(0) // January
  })
})

describe('getMonthEnd', () => {
  it('一月有 31 天', () => {
    expect(getMonthEnd(2024, 1)).toBe('2024-01-31')
  })
  it('閏年二月有 29 天', () => {
    expect(getMonthEnd(2024, 2)).toBe('2024-02-29')
  })
  it('非閏年二月有 28 天', () => {
    expect(getMonthEnd(2023, 2)).toBe('2023-02-28')
  })
  it('四月有 30 天', () => {
    expect(getMonthEnd(2024, 4)).toBe('2024-04-30')
  })
})

describe('parseTwseRows', () => {
  it('正常解析 TWSE 格式（民國年）', () => {
    const rows = [
      ['113/01/02', '100', '200', '300', '400', '500', '580', '600'],
      ['113/01/03', '100', '200', '300', '400', '500', '575', '600'],
    ]
    const result = parseTwseRows('2330', rows)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ date: '2024-01-02', close_price: 580 })
    expect(result[1]).toEqual({ date: '2024-01-03', close_price: 575 })
  })

  it('收盤價為 0 或 NaN 的列被跳過', () => {
    const rows = [
      ['113/01/02', '100', '200', '300', '400', '500', '0', '600'],
      ['113/01/03', '100', '200', '300', '400', '500', 'N/A', '600'],
    ]
    const result = parseTwseRows('2330', rows)
    expect(result).toHaveLength(0)
  })

  it('日期格式不正確（少欄位）被跳過', () => {
    const rows = [['113/01', '100', '200', '300', '400', '500', '580', '600']]
    const result = parseTwseRows('2330', rows)
    expect(result).toHaveLength(0)
  })

  it('空陣列回傳空結果', () => {
    expect(parseTwseRows('2330', [])).toEqual([])
    expect(parseTwseRows('2330')).toEqual([])
  })

  it('收盤價含千分位逗號能正確解析', () => {
    const rows = [['113/01/02', '100', '200', '300', '400', '500', '1,580', '600']]
    const result = parseTwseRows('2330', rows)
    expect(result[0].close_price).toBe(1580)
  })
})

describe('parseTpexRows', () => {
  it('正常解析 TPEx 格式（民國年）', () => {
    const rows = [
      ['113/01/02', '100', '200', '300', '400', '500', '42.5', '600'],
    ]
    const result = parseTpexRows('6547', rows)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ date: '2024-01-02', close_price: 42.5 })
  })
})

describe('parseYahooRows', () => {
  it('正常解析 Yahoo Finance JSON', () => {
    const resp = {
      chart: {
        result: [{
          timestamp: [1704153600], // 2024-01-02 UTC
          indicators: { quote: [{ close: [580.5] }] },
        }],
      },
    }
    const result = parseYahooRows(resp)
    expect(result).toHaveLength(1)
    expect(result[0].close_price).toBe(580.5)
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('null close 被跳過', () => {
    const resp = {
      chart: {
        result: [{
          timestamp: [1704153600, 1704240000],
          indicators: { quote: [{ close: [null, 580] }] },
        }],
      },
    }
    const result = parseYahooRows(resp)
    expect(result).toHaveLength(1)
    expect(result[0].close_price).toBe(580)
  })

  it('空回應回傳空陣列', () => {
    expect(parseYahooRows(null)).toEqual([])
    expect(parseYahooRows({})).toEqual([])
    expect(parseYahooRows({ chart: {} })).toEqual([])
  })
})
