-- =============================================
-- 012_stock_splits.sql
-- 股票分割管理：記錄每次分割的股票代號、基準日、倍數與原始持股快照
-- 支援一鍵還原（Rollback），防止誤按
-- =============================================

CREATE TABLE IF NOT EXISTS stock_splits (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code          VARCHAR(10)    NOT NULL,
  stock_name          VARCHAR(50)    NOT NULL,
  split_date          DATE           NOT NULL,
  ratio               NUMERIC(8,4)   NOT NULL,
  adjust_daily_prices BOOLEAN        NOT NULL DEFAULT true,
  holdings_count      INTEGER        NOT NULL DEFAULT 0,
  daily_prices_count  INTEGER        NOT NULL DEFAULT 0,
  status              VARCHAR(20)    NOT NULL DEFAULT 'applied', -- 'applied' | 'reverted'
  snapshot_data       JSONB,                                     -- 保存原持股與原日線價格快照供 100% 精準復原
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  reverted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS stock_splits_user_id_idx ON stock_splits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_splits_code_idx ON stock_splits (stock_code);

ALTER TABLE stock_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own splits" ON stock_splits;
CREATE POLICY "own splits" ON stock_splits
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
