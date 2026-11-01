-- 20261101120000_karlilik_kdv_haric
-- Karlılık ekranı: dönem geliri KDV HARİÇ (invoices.subtotal). Yalnız gelir ifadeleri değişir;
-- malzeme / işçilik / genel gider, imza, yetki kapısı ve izinler aynen kalır.
-- Spec: docs/superpowers/specs/2026-11-01-karlilik-klinik-islem-ciro-design.md §6
-- Geri alma: supabase/rollbacks/20261101120000_karlilik_kdv_haric.down.sql

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_cur text; v_orig numeric; v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi (tek tanım). Gelir = dönemde kesilen faturalar (saklı kurla
  -- ana para birimi), malzeme = o faturalara bağlı siparişlerin tüketimi; işçilik/genel gider dönem gideri.
  -- 20261101120000: gelir KDV HARİÇ (subtotal); kur = rate_at_time, yoksa amount_base/total, o da yoksa 1.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END, sum(i.subtotal)
    INTO v_cur, v_orig
  FROM invoices i
  WHERE i.lab_id=p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi') AND i.issue_date BETWEEN p_from AND p_to;
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
  WITH per_inv AS (   -- dönemde KESİLEN faturalar (tek tanım: taslak/iptal hariç, fatura tarihi)
    SELECT i.id, i.work_order_id, i.total, i.currency,
           i.subtotal * COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1) AS base
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), per_wo AS (  -- o faturalara bağlı siparişler (doğrudan bağ + toplu fatura bağları)
    SELECT pi2.work_order_id AS wo_id FROM per_inv pi2 WHERE pi2.work_order_id IS NOT NULL
    UNION
    SELECT io.work_order_id FROM invoice_orders io JOIN per_inv pi3 ON pi3.id = io.invoice_id
  ), op AS (
    SELECT COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo JOIN per_wo ON per_wo.wo_id = wo.id
    WHERE wo.lab_id=p_lab_id
  ), agg AS (
    SELECT (SELECT COUNT(*) FROM per_wo)::bigint AS cnt,
           (SELECT COALESCE(SUM(base),0) FROM per_inv) AS rev,
           (SELECT COALESCE(SUM(material),0) FROM op) AS mat
  )
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead,
    agg.mat + v_labor + v_overhead, agg.rev - (agg.mat + v_labor + v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev - (agg.mat + v_labor + v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(currency text, revenue numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20261026150000: dönem = FATURA tarihi; kesilmiş faturaların TAMAMI (toplu ve siparişsiz dahil) →
  -- finance_period_metrics.revenue ile aynı rakam.
  -- 20261101120000: KDV HARİÇ (subtotal) — artık finance_period_metrics'ten KDV kadar düşük; yalnız Karlılık okur.
  SELECT COALESCE(i.currency, 'TRY') AS currency, SUM(i.subtotal) AS revenue
  FROM invoices i
  WHERE i.lab_id = p_lab_id
    AND public.can_view_lab_profit(p_lab_id)
    AND i.status IN ('kesildi','kismi_odendi','odendi')
    AND i.issue_date BETWEEN p_from AND p_to
  GROUP BY COALESCE(i.currency, 'TRY')
  ORDER BY 1;
$function$;
