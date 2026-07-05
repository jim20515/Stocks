// 公開股票清單（訪客回測下拉用）。
// 用 get_price_codes RPC 取「有股價資料的代號」；名稱以 TWSE 完整清單（快取 1h）解析，
// RPC 不存在時退回精選清單（前端仍可輸入任意代號，公開股價可查）。

const POPULAR: { code: string; name: string }[] = [
  { code: '0050', name: '元大台灣50' },
  { code: '0056', name: '元大高股息' },
  { code: '006208', name: '富邦台50' },
  { code: '00878', name: '國泰永續高股息' },
  { code: '00662', name: '富邦NASDAQ' },
  { code: '00670L', name: '富邦NASDAQ正2' },
  { code: '00675L', name: '富邦臺灣加權正2' },
  { code: '2330', name: '台積電' },
  { code: '2412', name: '中華電' },
]

// 建名稱對照表：TWSE STOCK_DAY_ALL（快取 1h）為主，精選清單為輔
async function buildNameMap(): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  for (const p of POPULAR) if (p.name) nameMap.set(p.code, p.name)
  try {
    const storage = useStorage('cache')
    let twseList: { Code: string; Name: string }[] | null = await storage.getItem('twse:stock_day_all')
    if (!twseList) {
      twseList = await $fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
      await storage.setItem('twse:stock_day_all', twseList, { ttl: 3600 })
    }
    if (twseList) {
      for (const c of twseList) {
        const code = c.Code?.trim()
        const name = c.Name?.trim()
        if (code && name && !nameMap.has(code)) nameMap.set(code, name)
      }
    }
  } catch {}
  return nameMap
}

export default defineEventHandler(async (event) => {
  checkRateLimit(event, 'public-codes', 60, 60 * 1000)
  const client = useDb() // anon

  const nameMap = await buildNameMap()

  // 嘗試用 RPC 取「有資料的代號 + 統計」；失敗則退回精選清單
  try {
    const { data, error } = await client.rpc('get_price_codes')
    if (!error && Array.isArray(data) && data.length) {
      const stocks = (data as any[]).map(r => ({
        code: r.stock_code,
        name: nameMap.get(r.stock_code) || '—',
        minDate: r.min_date ?? '—',
        maxDate: r.max_date ?? '—',
        count: Number(r.cnt) || 0,
      }))
      return { codes: stocks.map(s => s.code), stocks }
    }
  } catch {}

  const stocks = POPULAR.map(p => ({
    code: p.code,
    name: nameMap.get(p.code) || p.name || p.code,
    minDate: '—', maxDate: '—', count: 1,
  }))
  return { codes: stocks.map(s => s.code), stocks }
})
