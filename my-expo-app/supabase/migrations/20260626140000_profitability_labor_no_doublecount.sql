-- ============================================================
-- 20260626 — Karlılık İşçilik ÇİFT SAYIM düzeltmesi
--
-- SORUN: trg_salary_to_expense her maaş ödemesini otomatik bir 'personel'
-- kategorili gider olarak da expenses'e yansıtıyor (Kasa/Gider takibi için).
-- profitability_summary İşçiliği = SUM(salary_payments) + SUM(personel giderleri)
-- şeklinde hesaplıyordu → aynı maaş HEM salary_payments HEM mirror-gider olarak
-- İKİ KEZ sayılıyordu (gross + net ≈ 2× gerçek maaş; avanslar ekstra şişiriyor).
--
-- ÇÖZÜM: İşçiliğin personel-gider kısmından OTOMATİK MIRROR'ları dışla
-- (salary_payment_id / advance_id dolu olanlar — bunlar zaten salary_payments
-- ve avans tarafından sayılıyor). Yalnız ELLE girilen personel giderleri kalır.
-- Geri kalan mantık (revenue/material/overhead) aynen korunur.
-- Idempotent.
-- ============================================================
DROP FUNCTION IF EXISTS public.profitability_summary(uuid,date,date);

CREATE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_cur text; v_orig numeric;
  v_labor numeric; v_overhead numeric;
BEGIN
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END,
         sum(i.total)
    INTO v_cur, v_orig
  FROM invoices i JOIN work_orders wo ON wo.id=i.work_order_id
  WHERE wo.lab_id=p_lab_id AND wo.created_at::DATE BETWEEN p_from AND p_to
    AND wo.status<>'iptal' AND i.status<>'iptal';

  -- İşçilik: maaş ödemeleri (gross) + YALNIZ elle girilen personel giderleri.
  -- Otomatik mirror'lar (salary_payment_id / advance_id dolu) ÇİFT SAYIMI önlemek
  -- için dışlanır — maaşlar zaten salary_payments'tan sayılıyor.
  v_labor :=
    COALESCE((SELECT SUM(COALESCE(sp.amount_base, sp.gross_amount)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(COALESCE(e.amount_base, e.amount)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel'
                AND e.salary_payment_id IS NULL AND e.advance_id IS NULL
                AND e.expense_date BETWEEN p_from AND p_to),0);

  -- Genel gider: malzeme & personel hariç tüm giderler (değişmedi)
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
