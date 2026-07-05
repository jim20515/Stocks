-- 操作稽核表：記錄每個 API 請求（誰、何時、打哪個端點、狀態）。
-- 只由 server 用 service_role 寫入；RLS 開啟但不建 policy → anon/authenticated 皆不可直接存取。
-- 保留 90 天，由 /api/cron/prune-logs 每天清除。

CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID,                                 -- null = 訪客
  is_guest    BOOLEAN NOT NULL DEFAULT false,
  ip          TEXT,
  event       TEXT NOT NULL,                         -- 例："POST /api/stockholdings"
  detail      JSONB,                                 -- 例：{ status: 200 }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON activity_log (user_id, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
-- 不建任何 policy：只有 service_role（server 端）能存取，前端完全碰不到。
