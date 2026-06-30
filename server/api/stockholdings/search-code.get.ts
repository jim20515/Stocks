export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = String(getQuery(event).name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: '請提供股票名稱' })
  if (name.length > 40) throw createError({ statusCode: 400, message: '股票名稱過長' })
  checkRateLimit(event, 'search-code', 30, 60 * 1000)

  function normalize(s: string) {
    return s.replace(/\s/g, '').toUpperCase()
  }

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

  const searchName = normalize(name)
  const candidates: { code: string; name: string; score: number }[] = []

  // TWSE 全量股票（含 ETF）每日行情清單
  try {
    const list = await $fetch<{ Code: string; Name: string }[]>(
      'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
    )
    for (const c of list) {
      const code = c.Code?.trim() ?? ''
      const abbr = normalize(c.Name ?? '')
      if (!code || !abbr) continue

      if (searchName === abbr) { candidates.push({ code, name: c.Name, score: 999 }); continue }
      if (searchName.includes(abbr) || abbr.includes(searchName)) {
        candidates.push({ code, name: c.Name, score: 100 })
        continue
      }
      const common = lcs(searchName, abbr)
      if (common >= 3) candidates.push({ code, name: c.Name, score: common })
    }
  } catch {}

  // 上櫃補充
  if (!candidates.length) {
    try {
      const list = await $fetch<{ 公司代號: string; 公司簡稱: string }[]>(
        'https://openapi.twse.com.tw/v1/opendata/t187ap03_O'
      )
      for (const c of list) {
        const code = c.公司代號?.trim() ?? ''
        const abbr = normalize(c.公司簡稱 ?? '')
        if (!code || !abbr) continue
        if (searchName.includes(abbr) || abbr.includes(searchName)) {
          candidates.push({ code, name: c.公司簡稱, score: 100 })
          continue
        }
        const common = lcs(searchName, abbr)
        if (common >= 3) candidates.push({ code, name: c.公司簡稱, score: common })
      }
    } catch {}
  }

  if (!candidates.length) return { code: null, name }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  return { code: best.code, name: best.name }
})
