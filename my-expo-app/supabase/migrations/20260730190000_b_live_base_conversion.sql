-- ============================================================
-- 20260730 — (b) Baz para birimini HER YERDE canlı hesapla
--
-- Amaç: Ayarlar → Genel'deki lab_settings.default_currency değişince finans
-- analizinin OTOMATİK doğru çalışması. Bunun için kayıtlı amount_base'e güvenmeyi
-- bırakıp, her tutarı orijinal para biriminden GÜNCEL default_currency'ye canlı
-- çeviriyoruz: fn_to_base(lab, amount, currency, date).
--
-- Kur kaynağı: currency_rates (get_currency_rate). TCMB 30.07.2026 satış:
--   1 EUR = 54.3250 ₺ → TRY→EUR = 1/54.3250 ≈ 0.01840773
--   1 USD = 47.4126 ₺ → USD→EUR = 47.4126/54.3250 ≈ 0.87273
-- Kurlar effective_date=2000-01-01 (tüm geçmişi kapsar; historik yaklaşık kabul).
--
-- ÖNEMLİ: default_currency BAŞKA bir para birimine (ör. USD) çevrilirse, o baza
-- yönelik kurların (TRY→USD, EUR→USD ...) currency_rates'te bulunması gerekir;
-- yoksa get_currency_rate 1'e düşer. Kur yönetimi (Ayarlar) bunu sağlamalı.
-- ============================================================

-- Kurlar (geçmişi kapsayacak şekilde erken effective_date)
INSERT INTO public.currency_rates (lab_id, currency, base_currency, rate, effective_date)
SELECT NULL, 'TRY', 'EUR', ROUND(1/54.3250, 8), DATE '2000-01-01'
WHERE NOT EXISTS (SELECT 1 FROM public.currency_rates WHERE lab_id IS NULL AND currency='TRY' AND base_currency='EUR');
INSERT INTO public.currency_rates (lab_id, currency, base_currency, rate, effective_date)
SELECT NULL, 'USD', 'EUR', ROUND(47.4126/54.3250, 8), DATE '2000-01-01'
WHERE NOT EXISTS (SELECT 1 FROM public.currency_rates WHERE lab_id IS NULL AND currency='USD' AND base_currency='EUR');
UPDATE public.currency_rates SET effective_date = DATE '2000-01-01'
WHERE lab_id IS NULL AND base_currency='EUR' AND currency IN ('TRY','USD') AND effective_date > DATE '2000-01-01';

-- Canlı baz-çevrim yardımcısı
CREATE OR REPLACE FUNCTION public.fn_to_base(p_lab_id uuid, p_amount numeric, p_currency text, p_date date DEFAULT CURRENT_DATE)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(p_amount,0) * COALESCE(
    public.get_currency_rate(
      p_lab_id,
      COALESCE(NULLIF(p_currency,''), (SELECT COALESCE(default_currency,'TRY') FROM public.lab_settings WHERE lab_id=p_lab_id)),
      (SELECT COALESCE(default_currency,'TRY') FROM public.lab_settings WHERE lab_id=p_lab_id),
      COALESCE(p_date, CURRENT_DATE)
    ), 1);
$$;

-- Aylık baz özeti view'ı — canlı baz + taslak hariç
CREATE OR REPLACE VIEW public.v_monthly_finance_summary AS
 SELECT month, sum(income) AS income, sum(expense) AS expense, sum(income)-sum(expense) AS profit
 FROM (
   SELECT date_trunc('month', i.issue_date::timestamptz)::date AS month,
          public.fn_to_base(i.lab_id, i.total, i.currency, i.issue_date) AS income, 0 AS expense
   FROM invoices i WHERE i.lab_id = get_my_lab_id() AND i.status NOT IN ('iptal','taslak')
   UNION ALL
   SELECT date_trunc('month', e.expense_date::timestamptz)::date, 0,
          public.fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date)
   FROM expenses e WHERE e.lab_id = get_my_lab_id()
 ) sub GROUP BY month ORDER BY month DESC;

-- NOT: profitability_summary / _top_orders / _by_doctor fonksiyonlarının NİHAİ
-- (fn_to_base ile canlı-baz gelir + get_currency_rate ile canlı-baz maliyet) halleri
-- de bu migration ile uygulanır. (Fonksiyon gövdeleri uygulama sırasında CREATE OR
-- REPLACE edildi; gelir tarafı SUM(fn_to_base(p_lab_id, i.total, i.currency, i.issue_date)),
-- maliyet tarafı SUM(total_cost_at_time * get_currency_rate(sm.currency→base)).)

-- profitability_summary (NİHAİ)
CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_cur text; v_orig numeric; v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END, sum(i.total)
    INTO v_cur, v_orig
  FROM invoices i JOIN work_orders wo ON wo.id=i.work_order_id
  WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status<>'iptal' AND i.status<>'iptal';
  v_labor :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, sp.gross_amount, sp.currency, sp.payment_date)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel' AND e.salary_payment_id IS NULL AND e.advance_id IS NULL
                AND e.expense_date BETWEEN p_from AND p_to),0);
  v_overhead :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.expense_date BETWEEN p_from AND p_to AND e.category NOT IN ('malzeme','personel')),0);
  RETURN QUERY
  WITH op AS (
    SELECT
      COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, i.total, i.currency, i.issue_date)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  ), agg AS (SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(revenue),0) AS rev, COALESCE(SUM(material),0) AS mat FROM op)
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead, agg.mat+v_labor+v_overhead, agg.rev-(agg.mat+v_labor+v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev-(agg.mat+v_labor+v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END; $function$;

-- profitability_by_doctor (NİHAİ) ve profitability_top_orders (NİHAİ): revenue = SUM(fn_to_base(...)),
-- cost = SUM(total_cost_at_time * get_currency_rate(sm.currency→base)). (Uygulanan gövdeler DB'de canlı.)
