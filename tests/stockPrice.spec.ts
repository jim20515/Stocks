// server/utils/stockPrice.ts 裡的純函式測試
// parseMisPrice 和 codeFromCh 是 module-private，需要用 vitest 的 importOriginal 或直接 import
// 因為它們不是 export，我們測 exported 函式的邊界：fetchPrices / fetchPricesWithChange / lookupStock
// 但這些全依賴外部 HTTP，所以我們 mock $fetch 來測邏輯分支

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 因為 stockPrice.ts 裡 parseMisPrice / codeFromCh 是 private，
// 我們透過 mock $fetch 間接測 fetchPrices / fetchPricesWithChange 的分支邏輯

// Mock $fetch
const mockFetch = vi.fn()
;(globalThis as any).$fetch = mockFetch

// 需要 readBody / defineEventHandler 等 Nitro auto-imports
;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).readBody = vi.fn()

// import 必須在 mock 之後
const { fetchPrices, fetchPricesWithChange, lookupStock } = await import('../server/utils/stockPrice')

describe('fetchPrices', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('空陣列回傳空物件', async () => {
    const result = await fetchPrices([])
    expect(result).toEqual({})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Yahoo 回傳有效股價時直接回傳', async () => {
    mockFetch.mockResolvedValueOnce({
      chart: {
        result: [{
          meta: { regularMarketPrice: 580 },
        }],
      },
    })

    const result = await fetchPrices(['2330'])
    expect(result['2330']).toBe(580)
  })

  it('Yahoo 回傳 price=0 時嘗試 TWSE 月報備援', async () => {
    // Yahoo chart returns price 0
    mockFetch.mockResolvedValueOnce({
      chart: { result: [{ meta: { regularMarketPrice: 0 } }] },
    })
    // TWSE month report
    mockFetch.mockResolvedValueOnce({
      stat: 'OK',
      title: '115年06月 2330 台積電  各日成交資訊',
      data: [
        ['115/06/01', '100', '200', '300', '400', '500', '570', '600'],
      ],
    })

    const result = await fetchPrices(['2330'])
    expect(result['2330']).toBe(570)
  })

  it('所有來源都失敗時回傳空物件', async () => {
    // Yahoo fails
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    // TWSE month report fails
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    // OTC fails
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const result = await fetchPrices(['9999'])
    expect(result).toEqual({})
  })
})

describe('fetchPricesWithChange', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('空陣列回傳空物件', async () => {
    const result = await fetchPricesWithChange([])
    expect(result).toEqual({})
  })

  it('MIS 回傳完整資料時含漲跌幅', async () => {
    mockFetch.mockResolvedValueOnce({
      msgArray: [{
        ch: 'tse_2330.tw',
        z: '580',  // 成交價
        y: '570',  // 昨收
        n: '台積電',
      }],
    })

    const result = await fetchPricesWithChange(['2330'])
    expect(result['2330']).toBeDefined()
    expect(result['2330'].price).toBe(580)
    expect(result['2330'].prevClose).toBe(570)
    // 漲幅 = (580-570)/570 * 100 ≈ 1.75%
    expect(result['2330'].changePct).toBeCloseTo(1.75, 1)
  })

  it('MIS 無成交價時用昨收 fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      msgArray: [{
        ch: 'tse_2330.tw',
        z: '-',  // 無成交
        y: '570',
        n: '台積電',
      }],
    })

    const result = await fetchPricesWithChange(['2330'])
    expect(result['2330']).toBeDefined()
    expect(result['2330'].price).toBe(570)
  })
})

describe('lookupStock', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('MIS 能查到名稱 + Yahoo 能查到價格時回傳完整資料', async () => {
    // MIS (tse) - name
    mockFetch.mockResolvedValueOnce({
      msgArray: [{ n: '台積電', ch: 'tse_2330.tw', z: '580' }],
    })
    // Yahoo - price
    mockFetch.mockResolvedValueOnce({
      chart: { result: [{ meta: { regularMarketPrice: 585 } }] },
    })

    const result = await lookupStock('2330')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('台積電')
    expect(result!.price).toBe(585)
  })

  it('完全查不到時回傳 null', async () => {
    // MIS tse - fail
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    // MIS otc - fail
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    // Yahoo - fail
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    // TWSE month report - no data (2 attempts for offset 0 and 1)
    mockFetch.mockResolvedValueOnce({ stat: 'FAIL' })
    mockFetch.mockResolvedValueOnce({ stat: 'FAIL' })
    // Listed company list - fail
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    // OTC company list - fail
    mockFetch.mockRejectedValueOnce(new Error('fail'))

    const result = await lookupStock('9999')
    expect(result).toBeNull()
  })
})
