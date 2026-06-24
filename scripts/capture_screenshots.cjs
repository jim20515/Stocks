const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Read credentials from env
const email = process.env.APP_EMAIL;
const password = process.env.APP_PASSWORD;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01_dashboard.png`, fullPage: true });
  console.log('captured: 01_dashboard');

  // 持股管理
  await page.goto(`${BASE}/stocks`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02_stocks.png`, fullPage: true });
  console.log('captured: 02_stocks');

  // 每日漲幅
  await page.goto(`${BASE}/daily`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03_daily.png`, fullPage: true });
  console.log('captured: 03_daily');

  // 資產配置
  await page.goto(`${BASE}/allocation`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/04_allocation.png`, fullPage: true });
  console.log('captured: 04_allocation');

  // 水位分析
  await page.goto(`${BASE}/watermark`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/05_watermark.png`, fullPage: true });
  console.log('captured: 05_watermark');

  // 人生目標
  await page.goto(`${BASE}/lifegoal`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06_lifegoal.png`, fullPage: true });
  console.log('captured: 06_lifegoal');

  // 帳戶管理
  await page.goto(`${BASE}/accounts`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/07_accounts.png`, fullPage: true });
  console.log('captured: 07_accounts');

  // 新增交易 modal
  await page.goto(`${BASE}/stocks`);
  await page.waitForTimeout(1500);
  await page.click('button:has-text("新增交易")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/08_new_transaction.png`, fullPage: true });
  console.log('captured: 08_new_transaction');

  // 匯入 modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('button:has-text("匯入")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09_import.png`, fullPage: true });
  console.log('captured: 09_import');

  // Login page
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/00_login.png` });
  console.log('captured: 00_login');

  await browser.close();
  console.log('Done. Screenshots saved to:', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
