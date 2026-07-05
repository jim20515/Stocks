// 公開股票清單（訪客回測下拉用）。
// 不依賴需登入的資料：回傳一組常見台股 ETF/個股，並用 get_price_codes RPC（若已建立）
// 補上「實際有資料」的統計；RPC 不存在時退回精選清單（前端仍可輸入任意代號，公開股價可查）。

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
  { code: '009816', name: '' },
]

export default defineEventHandler(async (event) => {
  checkRateLimit(event, 'public-codes', 60, 60 * 1000)
  const client = useDb() // anon

  // 嘗試用 RPC 取「有資料的代號 + 統計」；失敗（RPC 不存在等）則退回精選清單
  try {
    const { data, error } = await client.rpc('get_price_codes')
    if (!error && Array.isArray(data) && data.length) {
      const nameMap = new Map(POPULAR.map(p => [p.code, p.name]))
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

  const stocks = POPULAR.map(p => ({ code: p.code, name: p.name || p.code, minDate: '—', maxDate: '—', count: 1 }))
  return { codes: stocks.map(s => s.code), stocks }
})
