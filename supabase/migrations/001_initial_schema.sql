-- =============================================
-- 001_initial_schema.sql
-- 股票查詢系統 - 初始 Schema
-- =============================================

-- 【1】持股資料表
CREATE TABLE IF NOT EXISTS stock_holdings (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stock_code          VARCHAR(10)    NOT NULL,
  stock_name          VARCHAR(50)    NOT NULL,
  shares              INTEGER        NOT NULL,
  average_cost        NUMERIC(12,2)  NOT NULL,
  buy_date            DATE           NOT NULL,
  leverage_multiplier NUMERIC(4,2)   NOT NULL DEFAULT 1,
  watermark_price     NUMERIC(12,2),
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 【2】投資組合設定（singleton，id 固定為 1）
CREATE TABLE IF NOT EXISTS portfolio_settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  birth_year            INTEGER        NOT NULL DEFAULT 1988,
  cash_amount           NUMERIC(18,2)  NOT NULL DEFAULT 0,
  target_beta           NUMERIC(6,4)   NOT NULL DEFAULT 1.46,
  initial_amount        NUMERIC(18,2)  NOT NULL DEFAULT 20000000,
  annual_contribution   NUMERIC(18,2)  NOT NULL DEFAULT 5000000,
  stop_contribution_year INTEGER       NOT NULL DEFAULT 2030,
  expected_annual_return NUMERIC(6,4)  NOT NULL DEFAULT 0.16
);

-- 插入預設設定（若尚未存在）
INSERT INTO portfolio_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
