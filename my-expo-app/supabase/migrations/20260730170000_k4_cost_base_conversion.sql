-- ============================================================
-- 20260730 — K4: Maliyet (stok tüketim) tutarını da baz para birimine çevir
--
-- Sorun (latent): Kârlılık RPC'lerinde GELİR amount_base ile (baz'a çevrili) ama
-- MALİYET ham total_cost_at_time ile (hareketin kendi para biriminde, çevrilmemiş)
-- toplanıyordu. Tüm stok EUR olduğu sürece görünmez; baz-dışı (₺/$) bir stok maliyeti
-- girilince kâr yanlış olurdu (gelir-maliyet farklı birimlerde).
--
-- Çözüm: her stok maliyet toplamını hareketin para biriminden baz'a çevir:
--   total_cost_at_time * get_currency_rate(lab, COALESCE(sm.currency, base), base, sm.created_at)
-- Baz = lab_settings.default_currency. Orijinal veriye dokunulmaz; sadece toplama
-- para-birimi-tutarlı olur. İmzalar sabit → uygulama deploy'u gerekmez.
--
-- Etkilenen RPC'ler: profitability_summary, profitability_top_orders,
-- profitability_by_doctor, report_technician_usage, report_material_waste.
-- (Bu dosya bu 5 fonksiyonun NİHAİ halini içerir.)
-- ============================================================

-- 1) profitability_by_doctor
CREATE OR REPLACE FUNCTION public.profitability_by_doctor(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(doctor_id uuid, doctor_name text, order_count bigint, total_revenue numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  WITH oc AS (
    SELECT wo.doctor_id,
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  ),
  cur AS (
    SELECT wo.doctor_id,
      CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END AS rcur,
      sum(i.total) AS rorig
    FROM work_orders wo JOIN invoices i ON i.work_order_id=wo.id AND i.status<>'iptal'
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status<>'iptal'
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

-- 2) profitability_top_orders
CREATE OR REPLACE FUNCTION public.profitability_top_orders(p_lab_id uuid, p_limit integer, p_order_by text, p_from date, p_to date)
 RETURNS TABLE(id uuid, order_number text, patient_name text, doctor_name text, case_type text, sale_price numeric, total_cost numeric, profit numeric, margin_pct numeric, created_at timestamp with time zone, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  WITH oc AS (
    SELECT wo.id, wo.order_number, wo.patient_name, wo.doctor_id, wo.work_type, wo.created_at,
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS cost,
      (SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END
         FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal') AS rcur,
      COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal' AND i.currency<>'TRY'),0) AS rorig
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
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

-- 3) profitability_summary
CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_cur text; v_orig numeric;
  v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END, sum(i.total)
    INTO v_cur, v_orig
  FROM invoices i JOIN work_orders wo ON wo.id=i.work_order_id
  WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status<>'iptal' AND i.status<>'iptal';
  v_labor :=
    COALESCE((SELECT SUM(COALESCE(sp.amount_base, sp.gross_amount)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(COALESCE(e.amount_base, e.amount)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel' AND e.salary_payment_id IS NULL AND e.advance_id IS NULL
                AND e.expense_date BETWEEN p_from AND p_to),0);
  v_overhead :=
    COALESCE((SELECT SUM(COALESCE(e.amount_base, e.amount)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.expense_date BETWEEN p_from AND p_to AND e.category NOT IN ('malzeme','personel')),0);
  RETURN QUERY
  WITH op AS (
    SELECT
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  ), agg AS (
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(revenue),0) AS rev, COALESCE(SUM(material),0) AS mat FROM op
  )
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead,
    agg.mat + v_labor + v_overhead, agg.rev - (agg.mat + v_labor + v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev - (agg.mat + v_labor + v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END;
$function$;

-- 4) report_technician_usage (maliyet base'e çevrili; yalnız role='technician')
CREATE OR REPLACE FUNCTION public.report_technician_usage(p_lab_id uuid, p_from date, p_to date)
RETURNS TABLE(user_id uuid, user_name text, used_qty numeric, used_cost numeric, waste_qty numeric, waste_cost numeric, total_qty numeric, efficiency_pct numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  SELECT sm.user_id, COALESCE(p.full_name,'Bilinmeyen'),
    SUM(CASE WHEN sm.type='OUT'   THEN sm.quantity ELSE 0 END)::numeric,
    SUM(CASE WHEN sm.type='OUT'   THEN COALESCE(sm.total_cost_at_time,0) * COALESCE(get_currency_rate(p_lab_id, COALESCE(sm.currency,v_base), v_base, sm.created_at::date),1) ELSE 0 END)::numeric,
    SUM(CASE WHEN sm.type='WASTE' THEN sm.quantity ELSE 0 END)::numeric,
    SUM(CASE WHEN sm.type='WASTE' THEN COALESCE(sm.total_cost_at_time,0) * COALESCE(get_currency_rate(p_lab_id, COALESCE(sm.currency,v_base), v_base, sm.created_at::date),1) ELSE 0 END)::numeric,
    SUM(sm.quantity)::numeric,
    CASE WHEN SUM(sm.quantity)>0 THEN ROUND(SUM(CASE WHEN sm.type='OUT' THEN sm.quantity ELSE 0 END)/SUM(sm.quantity)*100,1) ELSE 100 END::numeric
  FROM stock_movements sm JOIN profiles p ON p.id=sm.user_id
  WHERE sm.type IN ('OUT','WASTE') AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND p.lab_id=p_lab_id AND p.role='technician'
  GROUP BY sm.user_id, p.full_name
  ORDER BY 4 DESC;
END;
$$;

-- 5) report_material_waste (waste_cost base'e çevrili; UI kolonlarıyla hizalı)
CREATE OR REPLACE FUNCTION public.report_material_waste(p_lab_id uuid, p_from date, p_to date)
RETURNS TABLE(item_id uuid, item_name text, type text, waste_qty numeric, waste_cost numeric, unit text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_base text;
BEGIN
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  RETURN QUERY
  SELECT si.id, si.name, COALESCE(si.category, si.type),
    SUM(sm.quantity)::numeric,
    SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(get_currency_rate(p_lab_id, COALESCE(sm.currency,v_base), v_base, sm.created_at::date),1))::numeric,
    si.unit
  FROM stock_movements sm JOIN stock_items si ON si.id=sm.item_id
  WHERE sm.type='WASTE' AND sm.created_at::DATE BETWEEN p_from AND p_to AND si.lab_id=p_lab_id
  GROUP BY si.id, si.name, COALESCE(si.category, si.type), si.unit
  ORDER BY 5 DESC;
END;
$$;
