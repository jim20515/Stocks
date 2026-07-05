-- 管理員名單。只有 service_role（server）能存取；後端用它判斷誰能看「帳號管理」。
CREATE TABLE IF NOT EXISTS app_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
-- 不建任何 policy：只有 service_role 能讀寫。

-- 初始管理員：jim.20515@gmail.com
INSERT INTO app_admins (user_id)
SELECT id FROM auth.users WHERE email = 'jim.20515@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
