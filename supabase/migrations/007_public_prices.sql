-- 放寬歷史股價 / 配息為「公開可讀」，讓未登入訪客也能試玩回測工具。
-- 歷史股價與配息屬公開市場資料，非個人機密。寫入政策維持需登入不變。

DROP POLICY IF EXISTS "read prices" ON stock_daily_prices;
CREATE POLICY "public read prices" ON stock_daily_prices FOR SELECT USING (true);

DROP POLICY IF EXISTS "read dividends" ON stock_dividends;
CREATE POLICY "public read dividends" ON stock_dividends FOR SELECT USING (true);

-- 公開列出「有股價資料的代號 + 統計」，給訪客回測下拉使用
CREATE OR REPLACE FUNCTION public.get_price_codes()
RETURNS TABLE (stock_code text, min_date date, max_date date, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stock_code, MIN(date) AS min_date, MAX(date) AS max_date, COUNT(*) AS cnt
  FROM stock_daily_prices
  GROUP BY stock_code
  ORDER BY stock_code;
$$;
GRANT EXECUTE ON FUNCTION public.get_price_codes() TO anon, authenticated;
