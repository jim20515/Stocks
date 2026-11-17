-- =============================================
-- 013_stock_splits_resume_date.sql
-- 股票分割管理補上「新股恢復交易日」欄位 (resume_date)。
-- 用於區分分割基準日（舊股最後交易日）與恢復上市交易日，
-- 以便停牌期間維持舊價，復牌日起自動校正每日資產快照。
-- =============================================

ALTER TABLE stock_splits
  ADD COLUMN IF NOT EXISTS resume_date DATE;
