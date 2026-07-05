export function useBacktestUpdate() {
  const updating = useState('backtestUpdating', () => false)
  const progress = useState('backtestUpdateProgress', () => '')

  const { authHeaders } = useAuth()

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

  function nextDate(dateStr: string) {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + 1)
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  }

  // 更新單一股票到今天（回測前呼叫）。回傳最終資料庫最新日期。
  async function updateOneLatest(code: string): Promise<string | null> {
    const latest = await $fetch<{ latestDate: string | null }>('/api/backtest/latest-date', {
      headers: authHeaders.value as HeadersInit,
      query: { code },
    })
    if (latest.latestDate && latest.latestDate >= today) return latest.latestDate
    let cursor: string | null = latest.latestDate ? nextDate(latest.latestDate) : '2000-01-01'
    let last = latest.latestDate
    let guard = 0
    while (cursor && guard < 100) {
      const res = await $fetch<any>('/api/backtest/history', {
        method: 'POST',
        headers: authHeaders.value as HeadersInit,
        body: { code, startDate: cursor, endDate: today, maxMonths: 6 },
      })
      if (res?.latestDate) last = res.latestDate
      cursor = res.nextStartDate
      guard++
    }
    return last
  }

  async function updateAllLatestPrices() {
    if (updating.value) return
    updating.value = true
    progress.value = '正在取得股票清單...'
    try {
      const { codes } = await $fetch<{ codes: string[] }>('/api/backtest/all-codes', {
        headers: authHeaders.value as HeadersInit,
      })
      if (!codes.length) { progress.value = '資料庫尚無股票資料'; return }

      for (let i = 0; i < codes.length; i++) {
        const c = codes[i]
        progress.value = `更新中 ${i + 1}/${codes.length}：${c}`
        try {
          const latest = await $fetch<{ latestDate: string | null }>('/api/backtest/latest-date', {
            headers: authHeaders.value as HeadersInit,
            query: { code: c },
          })
          if (latest.latestDate && latest.latestDate >= today) continue
          const updateStart = latest.latestDate ? nextDate(latest.latestDate) : '2000-01-01'
          let cursor: string | null = updateStart
          let guard = 0
          while (cursor && guard < 100) {
            const res = await $fetch<any>('/api/backtest/history', {
              method: 'POST',
              headers: authHeaders.value as HeadersInit,
              body: { code: c, startDate: cursor, endDate: today, maxMonths: 6 },
            })
            cursor = res.nextStartDate
            guard++
          }
        } catch { /* 單檔失敗不中斷 */ }
      }
      progress.value = `完成，共更新 ${codes.length} 支股票`
    } catch (e: any) {
      progress.value = e?.data?.message ?? '更新失敗'
    } finally {
      updating.value = false
    }
  }

  return { updating, progress, updateAllLatestPrices, updateOneLatest }
}
