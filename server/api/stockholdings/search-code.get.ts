export default defineEventHandler(async (event) => {
  const name = String(getQuery(event).name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: '請提供股票名稱' })

  const LISTED_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
  const OTC_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_O'

  for (const url of [LISTED_URL, OTC_URL]) {
    try {
      const list = await $fetch<{ 公司代號: string; 公司簡稱: string }[]>(url)
      const match = list.find(c =>
        c.公司簡稱.includes(name) || name.includes(c.公司簡稱)
      )
      if (match) return { code: match.公司代號, name: match.公司簡稱 }
    } catch {}
  }

  return { code: null, name }
})
