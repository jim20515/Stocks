export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { rows } = await readBody(event)

  if (!rows?.length) throw createError({ statusCode: 400, message: '無資料' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY 未設定' })

  // 取前 5 筆資料讓 AI 判斷欄位
  const sample = rows.slice(0, 5)

  const prompt = `你是一個股票對帳單解析助手。以下是從 Excel/XLS 檔案解析出的前幾筆資料（JSON 陣列，每筆是一列，key 是欄位名稱或欄位索引）：

${JSON.stringify(sample, null, 2)}

請判斷哪個 key 對應以下欄位，並以 JSON 格式回傳：
- dateKey: 交易日期欄位的 key
- typeKey: 交易類型欄位的 key（買進/賣出）
- nameKey: 股票名稱欄位的 key（可能含股票代號）
- sharesKey: 成交股數欄位的 key
- priceKey: 成交單價欄位的 key
- buyKeyword: 代表「買進」的文字（例如「現股買進」、「買入」）
- sellKeyword: 代表「賣出」的文字（例如「現股賣出」、「賣出」）
- codeInName: 股票代號是否包含在名稱欄位內（true/false）；若是，說明格式（例如「名稱(代號)」或「代號 名稱」）
- codeKey: 若股票代號是獨立欄位，填入該欄位的 key；否則填 null
- dateFormat: 日期格式說明（例如「YYYY/MM/DD」、「民國YYY/MM/DD」）

只回傳 JSON，不要任何說明文字。`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw createError({ statusCode: 500, message: 'AI 判斷失敗' })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text)
    return json
  } catch {
    throw createError({ statusCode: 500, message: 'AI 回傳格式錯誤: ' + text })
  }
})
