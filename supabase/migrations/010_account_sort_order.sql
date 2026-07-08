-- 帳戶自訂排序：新增 sort_order 欄位，讓使用者能在「帳戶管理」自訂帳戶順序，
-- 並讓全系統的帳戶下拉選單依此順序呈現。
ALTER TABLE portfolio_accounts
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 回填初始順序：每個使用者各自從 0 起算，依現有 created_at（同時間再以 id）排序。
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1 AS rn
  FROM portfolio_accounts
)
UPDATE portfolio_accounts p
SET sort_order = o.rn
FROM ordered o
WHERE p.id = o.id;
