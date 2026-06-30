-- 補齊所有缺少 RLS 的資料表

-- portfolio_accounts：每個使用者只能存取自己的帳戶別名
ALTER TABLE portfolio_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON portfolio_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- portfolio_daily_snapshot：每個使用者只能存取自己的資產快照
ALTER TABLE portfolio_daily_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snapshots" ON portfolio_daily_snapshot
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_stock_tracking：每個使用者只能存取自己的追蹤清單
ALTER TABLE user_stock_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tracking" ON user_stock_tracking
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- stock_daily_prices：共用歷史價格表，登入後可讀，寫入由 server 負責
ALTER TABLE stock_daily_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read prices" ON stock_daily_prices
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insert prices" ON stock_daily_prices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "delete prices" ON stock_daily_prices
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- stock_dividends：共用配息資料表，登入後可讀寫
ALTER TABLE stock_dividends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read dividends" ON stock_dividends
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "insert dividends" ON stock_dividends
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "delete dividends" ON stock_dividends
  FOR DELETE USING (auth.uid() IS NOT NULL);
