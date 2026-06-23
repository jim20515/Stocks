export default defineEventHandler(async (event) => {
  const name = String(getQuery(event).name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: '請提供股票名稱' })

  // 計算兩個字串的最長公共子字串長度
  function lcs(a: string, b: string): number {
    let max = 0
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        let len = 0
        while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len++
        if (len > max) max = len
      }
    }
    return max
  }

  // 正規化：移除空白、大小寫統一、全形轉半形
  function normalize(s: string) {
    return s.replace(/\s/g, '').toUpperCase()
      .replace(/Ａ-Ｚ/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  }

  const searchName = normalize(name)

  const sources = [
    'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',  // 上市公司
    'https://openapi.twse.com.tw/v1/opendata/t187ap03_O',  // 上櫃公司
    'https://openapi.twse.com.tw/v1/ETF/domestic',          // 上市 ETF
  ]

  const candidates: { code: string; abbr: string; score: number }[] = []

  for (const url of sources) {
    try {
      const list = await $fetch<any[]>(url)
      for (const c of list) {
        const code: string = c.公司代號 ?? c.stockNo ?? c.ETFid ?? ''
        const abbr: string = normalize(c.公司簡稱 ?? c.stockName ?? c.ETFname ?? '')
        if (!code || !abbr) continue

        // 完全包含：高分
        if (searchName.includes(abbr) || abbr.includes(searchName)) {
          candidates.push({ code, abbr, score: 100 })
          continue
        }
        // 最長公共子字串 >= 3 個字：計分
        const common = lcs(searchName, abbr)
        if (common >= 3) {
          candidates.push({ code, abbr, score: common })
        }
      }
    } catch {}
  }

  if (!candidates.length) return { code: null, name }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  return { code: best.code, name: best.abbr }
})
