-- 【1】stock_holdings 加 user_id
ALTER TABLE stock_holdings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 【2】portfolio_settings 改為 per-user（移除 singleton 限制，改用 user_id 為唯一鍵）
ALTER TABLE portfolio_settings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- portfolio_settings 每個 user 只有一筆，user_id 為唯一鍵
ALTER TABLE portfolio_settings
  DROP CONSTRAINT IF EXISTS portfolio_settings_pkey CASCADE;
ALTER TABLE portfolio_settings
  ADD CONSTRAINT portfolio_settings_user_id_key UNIQUE (user_id);

-- 【3】啟用 RLS
ALTER TABLE stock_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_settings ENABLE ROW LEVEL SECURITY;

-- 【4】stock_holdings RLS 政策
DROP POLICY IF EXISTS "own holdings" ON stock_holdings;
CREATE POLICY "own holdings" ON stock_holdings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 【5】portfolio_settings RLS 政策
DROP POLICY IF EXISTS "own settings" ON portfolio_settings;
CREATE POLICY "own settings" ON portfolio_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
