-- =============================================
-- 006_strategy_battles.sql
-- 策略實戰群組：存「群組名 + 篩選規則 + 獲利目標」
-- 交易成員以規則動態比對 stock_holdings，不修改交易本身
-- =============================================

CREATE TABLE IF NOT EXISTS strategy_battles (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              VARCHAR(40) NOT NULL,   -- 群組名 / 標籤
  filter_code       VARCHAR(10),            -- by 股票（選填）
  filter_account    VARCHAR(40),            -- by 帳戶（選填）
  filter_start_date DATE,                   -- by 區間起（選填）
  filter_end_date   DATE,                   -- by 區間迄（選填）
  include_fee       BOOLEAN NOT NULL DEFAULT TRUE,  -- 計算是否扣手續費/證交稅
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE strategy_battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own battles" ON strategy_battles;
CREATE POLICY "own battles" ON strategy_battles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
