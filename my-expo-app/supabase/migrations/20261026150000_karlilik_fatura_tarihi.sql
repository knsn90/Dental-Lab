-- 20261026150000_karlilik_fatura_tarihi.sql
-- Tek tanım (Y2) Task 12: Karlılık dönemi FATURA tarihine göre (eskiden sipariş açılış tarihi).
--  Gelir = dönemde kesilen faturalar (taslak/iptal hariç; ana para biriminde SAKLI kurla).
--  Malzeme = o faturalara bağlı siparişlerin tüketimi (doğrudan bağ + toplu fatura bağları).
--  profitability_revenue_ccy = finance_period_metrics.revenue (aynı rakam).
--  Kırılım (hekim, sipariş) bugünkü bağla: toplu faturanın geliri ilk siparişte (2. dalga 12 ayrı iş).
--  Yetki korumaları (0c) aynen.
-- Geri alma: rollbacks/20261026150000_karlilik_fatura_tarihi.down.sql

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_cur text; v_orig numeric; v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi (tek tanım). Gelir = dönemde kesilen faturalar (saklı kurla
  -- ana para birimi), malzeme = o faturalara bağlı siparişlerin tüketimi; işçilik/genel gider dönem gideri.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END, sum(i.total)
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
           COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1)) AS base
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

CREATE OR REPLACE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi; siparişler = dönemde faturalanan siparişler.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  WITH per_inv AS (   -- dönemde KESİLEN faturalar (tek tanım: taslak/iptal hariç, fatura tarihi)
    SELECT i.id, i.work_order_id, i.total, i.currency,
           COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1)) AS base
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), per_wo AS (  -- o faturalara bağlı siparişler (doğrudan bağ + toplu fatura bağları)
    SELECT pi2.work_order_id AS wo_id FROM per_inv pi2 WHERE pi2.work_order_id IS NOT NULL
    UNION
    SELECT io.work_order_id FROM invoice_orders io JOIN per_inv pi3 ON pi3.id = io.invoice_id
  ), oc AS (
    SELECT wo.doctor_id,
      COALESCE((SELECT SUM(x.base) FROM per_inv x WHERE x.work_order_id=wo.id),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo JOIN per_wo ON per_wo.wo_id = wo.id
    WHERE wo.lab_id=p_lab_id
  ),
  cur AS (
    SELECT wo.doctor_id,
      CASE WHEN count(DISTINCT x.currency)=1 AND max(x.currency)<>'TRY' THEN max(x.currency) END AS rcur,
      sum(x.total) AS rorig
    FROM work_orders wo JOIN per_inv x ON x.work_order_id=wo.id
    WHERE wo.lab_id=p_lab_id
    GROUP BY wo.doctor_id
  )
  SELECT oc.doctor_id, COALESCE(d.full_name, dr.full_name, 'Bilinmeyen'), COUNT(*),
    COALESCE(SUM(oc.revenue),0), COALESCE(SUM(oc.cost),0), COALESCE(SUM(oc.revenue-oc.cost),0),
    CASE WHEN SUM(oc.revenue)>0 THEN ROUND((SUM(oc.revenue-oc.cost)/SUM(oc.revenue))*100,1) ELSE 0 END,
    max(cur.rcur), CASE WHEN max(cur.rcur) IS NOT NULL THEN max(cur.rorig) END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  LEFT JOIN cur ON cur.doctor_id=oc.doctor_id
  GROUP BY oc.doctor_id, d.full_name, dr.full_name
  HAVING SUM(oc.revenue) <> 0 OR SUM(oc.cost) <> 0
  ORDER BY 6 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(id uuid, order_number text, patient_name text, doctor_name text, case_type text, sale_price numeric, total_cost numeric, profit numeric, margin_pct numeric, created_at timestamp with time zone, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi; siparişler = dönemde faturalanan siparişler.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  WITH per_inv AS (   -- dönemde KESİLEN faturalar (tek tanım: taslak/iptal hariç, fatura tarihi)
    SELECT i.id, i.work_order_id, i.total, i.currency,
           COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1)) AS base
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), per_wo AS (  -- o faturalara bağlı siparişler (doğrudan bağ + toplu fatura bağları)
    SELECT pi2.work_order_id AS wo_id FROM per_inv pi2 WHERE pi2.work_order_id IS NOT NULL
    UNION
    SELECT io.work_order_id FROM invoice_orders io JOIN per_inv pi3 ON pi3.id = io.invoice_id
  ), oc AS (
    SELECT wo.id, wo.order_number, wo.patient_name, wo.doctor_id, wo.work_type, wo.created_at,
      COALESCE((SELECT SUM(x.base) FROM per_inv x WHERE x.work_order_id=wo.id),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost,
      (SELECT CASE WHEN count(DISTINCT x.currency)=1 AND max(x.currency)<>'TRY' THEN max(x.currency) END FROM per_inv x WHERE x.work_order_id=wo.id) AS rcur,
      COALESCE((SELECT SUM(x.total) FROM per_inv x WHERE x.work_order_id=wo.id AND x.currency<>'TRY'),0) AS rorig
    FROM work_orders wo JOIN per_wo ON per_wo.wo_id = wo.id
    WHERE wo.lab_id=p_lab_id
  )
  SELECT oc.id, oc.order_number, oc.patient_name, COALESCE(d.full_name, dr.full_name), oc.work_type,
    oc.revenue, oc.cost, oc.revenue - oc.cost,
    CASE WHEN oc.revenue>0 THEN ROUND(((oc.revenue-oc.cost)/oc.revenue)*100,1) ELSE 0 END, oc.created_at,
    oc.rcur, CASE WHEN oc.rcur IS NOT NULL THEN oc.rorig END
  FROM oc
  LEFT JOIN profiles d ON d.id=oc.doctor_id
  LEFT JOIN doctors dr ON dr.id=oc.doctor_id
  WHERE oc.revenue <> 0 OR oc.cost <> 0
  ORDER BY
    CASE WHEN p_order_by='best'  THEN oc.revenue-oc.cost END DESC NULLS LAST,
    CASE WHEN p_order_by='worst' THEN oc.revenue-oc.cost END ASC NULLS LAST
  LIMIT p_limit;
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
  SELECT COALESCE(i.currency, 'TRY') AS currency, SUM(i.total) AS revenue
  FROM invoices i
  WHERE i.lab_id = p_lab_id
    AND public.can_view_lab_profit(p_lab_id)
    AND i.status IN ('kesildi','kismi_odendi','odendi')
    AND i.issue_date BETWEEN p_from AND p_to
  GROUP BY COALESCE(i.currency, 'TRY')
  ORDER BY 1;
$function$;
