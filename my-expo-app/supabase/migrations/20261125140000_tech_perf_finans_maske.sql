-- ═══════════════════════════════════════════════════════════════════════════
-- report_technician_performance — finans alanları yetkiye göre maskelenir.
--
-- Sorun: lab yöneticisi (lab_manager) Performans sayfasını görür ama view_profit /
-- view_cost yetkisi yoktur. Ekran tutarları gizliyordu, fakat RPC yanıtı kâr ve
-- maliyet tutarlarını yine taşıyordu (tarayıcı ağ sekmesinden okunabiliyordu).
--
-- Çözüm (sunucu tarafı, tek doğruluk kaynağı):
--   • profit_contribution             → view_profit yoksa NULL
--   • hourly_rate, used_cost,
--     waste_cost, labor_cost           → view_cost   yoksa NULL
--   • YENİ contribution_score (0–100) → herkese döner; dönemin en yüksek pozitif
--     katkısı = 100, diğerleri ona oranlanır, sıfır/negatif = 0, pozitif yoksa NULL.
--     Yöneticinin "Katkı puanı" sütunu bunu okur (tutar olmadan sıralama).
-- Yetki: get_my_permissions() (rol + kişiye özel override) — istemcideki can() ile
-- aynı kaynak. admin user_type ve service_role tam görür.
--
-- Dönen şekle sütun eklendiği için CREATE OR REPLACE yetmez → DROP + CREATE.
-- Argümanlar aynı; yetkiler (authenticated, service_role) yeniden verilir.
-- Geri alma: supabase/rollbacks/20261125140000_tech_perf_finans_maske.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.report_technician_performance(uuid, date, date, text);

CREATE FUNCTION public.report_technician_performance(
  p_lab_id        uuid,
  p_from          date,
  p_to            date,
  p_material_type text DEFAULT NULL
) RETURNS TABLE (
  user_id             uuid,
  user_name           text,
  hourly_rate         numeric,
  used_qty            numeric,
  used_cost           numeric,
  waste_qty           numeric,
  waste_cost          numeric,
  efficiency_pct      numeric,
  labor_minutes       numeric,
  labor_hours         numeric,
  labor_cost          numeric,
  orders_worked       bigint,
  profit_contribution numeric,
  contribution_score  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base     text;
  v_perms    text[];
  v_full     boolean;
  v_profit   boolean;
  v_cost     boolean;
BEGIN
  PERFORM assert_my_lab(p_lab_id);
  SELECT COALESCE(default_currency, 'TRY') INTO v_base FROM lab_settings WHERE lab_id = p_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  -- Finans görünürlüğü
  v_full := COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin');
  v_perms  := COALESCE(public.get_my_permissions(), '{}'::text[]);
  v_profit := v_full OR 'view_profit' = ANY (v_perms);
  v_cost   := v_full OR 'view_cost'   = ANY (v_perms);

  RETURN QUERY
  WITH
  stg AS (
    SELECT os.technician_id, os.work_order_id,
           SUM(COALESCE(os.duration_min, 0))      AS mins,
           SUM(COALESCE(os.estimated_minutes, 0)) AS est_mins
    FROM order_stages os
    JOIN work_orders wo ON wo.id = os.work_order_id
    WHERE os.technician_id IS NOT NULL
      AND os.completed_at IS NOT NULL
      AND os.completed_at::date BETWEEN p_from AND p_to
      AND wo.lab_id = p_lab_id
    GROUP BY os.technician_id, os.work_order_id
  ),
  order_tot AS (
    SELECT os.work_order_id, SUM(COALESCE(os.duration_min, 0)) AS total_mins
    FROM order_stages os
    WHERE os.completed_at IS NOT NULL
      AND os.work_order_id IN (SELECT DISTINCT work_order_id FROM stg)
    GROUP BY os.work_order_id
  ),
  order_profit AS (
    SELECT s.work_order_id,
           op.profit * COALESCE(
             public.get_currency_rate(p_lab_id, op.currency, v_base,
               COALESCE(wo.delivery_date, wo.created_at::date)), 1) AS profit_base
    FROM (SELECT DISTINCT work_order_id FROM stg) s
    JOIN work_orders wo ON wo.id = s.work_order_id
    CROSS JOIN LATERAL public.calculate_order_profit(s.work_order_id) op
  ),
  agg AS (
    SELECT stg.technician_id AS tid,
           COUNT(DISTINCT stg.work_order_id) AS orders_worked,
           SUM(stg.mins)     AS labor_minutes,
           SUM(stg.est_mins) AS est_minutes
    FROM stg GROUP BY stg.technician_id
  ),
  prof AS (
    SELECT stg.technician_id AS tid,
           SUM(
             COALESCE(opf.profit_base, 0)
             * CASE WHEN ot.total_mins > 0 THEN stg.mins::numeric / ot.total_mins ELSE 0 END
           ) AS profit_contribution
    FROM stg
    JOIN order_tot ot ON ot.work_order_id = stg.work_order_id
    LEFT JOIN order_profit opf ON opf.work_order_id = stg.work_order_id
    GROUP BY stg.technician_id
  ),
  mat AS (
    SELECT sm.user_id AS tid,
      SUM(CASE WHEN sm.type = 'OUT'   THEN COALESCE(sm.quantity, 0)           ELSE 0 END) AS used_qty,
      SUM(CASE WHEN sm.type = 'OUT'   THEN COALESCE(sm.total_cost_at_time, 0) ELSE 0 END) AS used_cost,
      SUM(CASE WHEN sm.type = 'WASTE' THEN COALESCE(sm.quantity, 0)           ELSE 0 END) AS waste_qty,
      SUM(CASE WHEN sm.type = 'WASTE' THEN COALESCE(sm.total_cost_at_time, 0) ELSE 0 END) AS waste_cost
    FROM stock_movements sm
    JOIN stock_items si ON si.id = sm.item_id
    WHERE sm.type IN ('OUT', 'WASTE')
      AND sm.created_at::date BETWEEN p_from AND p_to
      AND (p_material_type IS NULL OR si.category = p_material_type)
      AND sm.user_id IN (SELECT DISTINCT technician_id FROM stg)
    GROUP BY sm.user_id
  ),
  res AS (
    SELECT
      a.tid,
      p.full_name,
      COALESCE(p.hourly_rate, 0)::numeric                          AS r_rate,
      COALESCE(m.used_qty, 0)::numeric                             AS r_used_qty,
      COALESCE(m.used_cost, 0)::numeric                            AS r_used_cost,
      COALESCE(m.waste_qty, 0)::numeric                            AS r_waste_qty,
      COALESCE(m.waste_cost, 0)::numeric                           AS r_waste_cost,
      CASE WHEN a.labor_minutes > 0 AND a.est_minutes > 0
        THEN ROUND(LEAST(200, a.est_minutes::numeric / a.labor_minutes * 100), 0)
        ELSE NULL END                                              AS r_eff,
      a.labor_minutes::numeric                                     AS r_lab_min,
      ROUND(a.labor_minutes / 60.0, 2)                             AS r_lab_h,
      ROUND(a.labor_minutes / 60.0 * COALESCE(p.hourly_rate, 0), 2) AS r_lab_cost,
      a.orders_worked                                              AS r_orders,
      ROUND(COALESCE(pr.profit_contribution, 0), 2)                AS r_profit
    FROM agg a
    JOIN profiles p ON p.id = a.tid
    LEFT JOIN prof pr ON pr.tid = a.tid
    LEFT JOIN mat  m  ON m.tid  = a.tid
  ),
  scored AS (
    SELECT res.*, MAX(GREATEST(res.r_profit, 0)) OVER () AS max_pos FROM res
  )
  SELECT
    s.tid,
    s.full_name,
    CASE WHEN v_cost   THEN s.r_rate       END,
    s.r_used_qty,
    CASE WHEN v_cost   THEN s.r_used_cost  END,
    s.r_waste_qty,
    CASE WHEN v_cost   THEN s.r_waste_cost END,
    s.r_eff,
    s.r_lab_min,
    s.r_lab_h,
    CASE WHEN v_cost   THEN s.r_lab_cost   END,
    s.r_orders,
    CASE WHEN v_profit THEN s.r_profit     END,
    CASE WHEN s.max_pos > 0
      THEN CASE WHEN s.r_profit > 0 THEN ROUND(s.r_profit / s.max_pos * 100)::integer ELSE 0 END
      ELSE NULL END
  FROM scored s
  ORDER BY s.r_orders DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_technician_performance(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_technician_performance(uuid, date, date, text) TO authenticated, service_role;
