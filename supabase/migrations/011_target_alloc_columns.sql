-- =============================================
-- 011_target_alloc_columns.sql
-- portfolio_settings 補上「目標配置」欄位。
-- 資產配置頁的「目標配置設定」(1倍/2倍槓桿目標%) 由 settings.put 寫入 target_alloc_1x /
-- target_alloc_2x，但先前沒有對應的 migration 建欄位，導致寫入失敗、數值無法保存（看起來會「跑掉」）。
-- 用 IF NOT EXISTS，欄位已存在時為 no-op，可安全重複執行。
-- =============================================

ALTER TABLE portfolio_settings
  ADD COLUMN IF NOT EXISTS target_alloc_1x NUMERIC(5,2) NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS target_alloc_2x NUMERIC(5,2) NOT NULL DEFAULT 20;
