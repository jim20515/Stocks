const { chromium } = require('playwright')
const path = require('path')

const BASE = 'http://localhost:3000'
const OUT = '/Users/jim/AI系統/Stocks/screenshots'
const EMAIL = 'jim@sixdots.com.tw'
const PASS = 'Jim2017060!'

async function shot(page, name) {
  await page.waitForTimeout(1800)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  console.log('✓', name)
}

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.waitForTimeout(2000)
  await page.evaluate(() => { const o = document.querySelector('vite-error-overlay'); if (o) o.remove() })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  await page.waitForTimeout(2000)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  await login(page)

  // 1. 總覽儀表板
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(2500)
  await shot(page, '01_總覽儀表板')

  // 2. 持股管理
  await page.goto(`${BASE}/stocks`)
  await page.waitForTimeout(2000)
  await shot(page, '02_持股管理')

  // 3. 新增交易視窗
  await page.click('button:has-text("新增交易")')
  await page.waitForTimeout(1200)
  await shot(page, '03_新增交易視窗')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // 4. 每日漲幅
  await page.goto(`${BASE}/daily`)
  await page.waitForTimeout(2000)
  await shot(page, '04_每日漲幅')

  // 5. 資產配置
  await page.goto(`${BASE}/allocation`)
  await page.waitForTimeout(2500)
  await shot(page, '05_資產配置')

  // 6. 水位分析
  await page.goto(`${BASE}/watermark`)
  await page.waitForTimeout(2000)
  await shot(page, '06_水位分析')

  // 7. 回測分析（空白）
  await page.goto(`${BASE}/backtest`)
  await page.waitForTimeout(2000)
  await shot(page, '07_回測分析')

  // 8. 回測結果（帶入 0050）
  await page.fill('input[placeholder*="搜尋"]', '0050')
  await page.waitForTimeout(3000)
  await page.click('button:has-text("開始回測")')
  await page.waitForTimeout(4000)
  await shot(page, '08_回測結果')

  // 9. 策略回測
  await page.goto(`${BASE}/backtest/strategy`)
  await page.waitForTimeout(2500)
  await shot(page, '09_策略回測')

  // 10. 更新歷史數據
  await page.goto(`${BASE}/backtest/history`)
  await page.waitForTimeout(2000)
  await shot(page, '10_更新歷史數據')

  // 11. 人生目標
  await page.goto(`${BASE}/lifegoal`)
  await page.waitForTimeout(2500)
  await shot(page, '11_人生目標')

  // 12. 帳戶管理
  await page.goto(`${BASE}/accounts`)
  await page.waitForTimeout(2000)
  await shot(page, '12_帳戶管理')

  await browser.close()
  console.log('\n✅ 全部截圖完成！')
})()
