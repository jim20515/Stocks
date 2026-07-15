
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const token = getBearerToken(event)
  const client = useDb(token)
  const body = await readBody(event)
  const year = new Date().getFullYear()

  // 先讀現有設定：body 沒帶到的欄位沿用舊值，避免別的頁面（如人生目標）PUT 時
  // 把沒帶到的欄位（例如目標配置 target_alloc）洗成預設值。
  const { data: existing } = await client
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  const pick = (camel: string, snake: string, dflt: number) =>
    body[camel] ?? body[snake] ?? (existing as any)?.[snake] ?? dflt

  const payload = {
    user_id:                userId,
    cash_amount:            finiteNumber(pick('cashAmount',           'cash_amount',            0),        '現金部位', 0, 1_000_000_000_000),
    target_beta:            finiteNumber(pick('targetBeta',           'target_beta',            1.46),     '目標 Beta', 0, 20),
    start_invest_year:      finiteNumber(pick('startInvestYear',      'start_invest_year',      year),     '開始投資年份', 1900, 2200),
    initial_age:            finiteNumber(pick('initialAge',           'initial_age',            30),       '起始年齡', 0, 120),
    initial_amount:         finiteNumber(pick('initialAmount',        'initial_amount',         20000000), '開始資金', 0, 1_000_000_000_000),
    annual_contribution:    finiteNumber(pick('annualContribution',   'annual_contribution',    5000000),  '每年投入', 0, 1_000_000_000_000),
    stop_contribution_year: finiteNumber(pick('stopContributionYear', 'stop_contribution_year', 2030),     '停止投入年份', 1900, 2200),
    expected_annual_return: finiteNumber(pick('expectedAnnualReturn', 'expected_annual_return', 0.16),     '預期年化報酬', -1, 10),
    target_alloc_1x:        finiteNumber(pick('targetAlloc1x',        'target_alloc_1x',        70),       '一倍配置', 0, 100),
    target_alloc_2x:        finiteNumber(pick('targetAlloc2x',        'target_alloc_2x',        20),       '兩倍配置', 0, 100),
  }

  const { data, error } = await client
    .from('portfolio_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
