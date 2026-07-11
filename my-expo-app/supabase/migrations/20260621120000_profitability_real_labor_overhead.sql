-- Karlılık → Maliyet Dağılımı: İşçilik ve Genel Gider artık gerçek hesaplanıyor
-- (önceden sabit 0 dönüyordu). Tüm tutarlar baz ₺ (amount_base), dönem bazlı.
--   • Materyal   = stok tüketimi (stock_movements OUT/WASTE total_cost_at_time)  [değişmedi]
--   • İşçilik    = salary_payments (payment_date dönemde) + expenses[personel]
--   • Genel Gider= expenses (malzeme & personel hariç: kira/ekipman/vergi/diger)
-- revenue + revenue_currency/revenue_original mantığı 20260620170000 ile aynı.
DROP FUNCTION IF EXISTS public.profitability_summary(uuid,date,date);

CREATE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_cur text; v_orig numeric;
  v_labor numeric; v_overhead numeric;
BEGIN
  -- Faturalar tek (baz olmayan) para birimindeyse orijinal döviz bilgisi
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END,
         sum(i.total)
    INTO v_cur, v_orig
  FROM invoices i JOIN work_orders wo ON wo.id=i.work_order_id
  WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status<>'iptal' AND i.status<>'iptal';

  -- İşçilik: maaş ödemeleri (dönem) + personel kategorili giderler
  v_labor :=
    COALESCE((SELECT SUM(COALESCE(sp.amount_base, sp.gross_amount)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(COALESCE(e.amount_base, e.amount)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel' AND e.expense_date BETWEEN p_from AND p_to),0);

  -- Genel gider: malzeme (COGS) ve personel (işçilik) hariç tüm giderler
  v_overhead :=
    COALESCE((SELECT SUM(COALESCE(e.amount_base, e.amount)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.expense_date BETWEEN p_from AND p_to
                AND e.category NOT IN ('malzeme','personel')),0);

  RETURN QUERY
  WITH op AS (
    SELECT
      COALESCE((SELECT SUM(COALESCE(i.amount_base, i.total)) FROM invoices i WHERE i.work_order_id=wo.id AND i.status<>'iptal'),0) AS revenue,
      COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0)) FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo
    WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to AND wo.status <> 'iptal'
  ), agg AS (
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(revenue),0) AS rev, COALESCE(SUM(material),0) AS mat FROM op
  )
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead,
    agg.mat + v_labor + v_overhead,
    agg.rev - (agg.mat + v_labor + v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev - (agg.mat + v_labor + v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END;
$function$;
