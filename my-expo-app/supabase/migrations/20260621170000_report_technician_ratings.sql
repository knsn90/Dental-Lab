-- Faz 3: İş değerlendirme puanlarını teknisyene topla (order_reviews → order_stages.technician_id).
-- Atama: işin tamamlanmış aşamasını yapan HER teknisyen, o işin değerlendirme(ler)ini alır.
-- (technician_id, review_id) DISTINCT ile çok-aşamalı çift sayım engellenir.
CREATE OR REPLACE FUNCTION public.report_technician_ratings(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE (
  user_id        uuid,
  full_name      text,
  review_count   bigint,
  rated_orders   bigint,
  avg_overall    numeric,
  avg_fit        numeric,
  avg_occlusion  numeric,
  avg_contacts   numeric,
  avg_esthetics  numeric,
  avg_surface    numeric,
  avg_on_time    numeric
 ) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH tr AS (
    SELECT DISTINCT os.technician_id, r.id AS review_id, r.work_order_id,
      r.overall, r.fit, r.occlusion, r.contacts, r.esthetics, r.surface, r.on_time
    FROM order_stages os
    JOIN work_orders  wo ON wo.id = os.work_order_id
    JOIN order_reviews r ON r.work_order_id = os.work_order_id
    WHERE os.technician_id IS NOT NULL
      AND os.completed_at IS NOT NULL
      AND COALESCE(os.completed_at, os.started_at)::DATE BETWEEN p_from AND p_to
      AND wo.lab_id = p_lab_id
  )
  SELECT tr.technician_id, p.full_name,
    COUNT(*)::bigint,
    COUNT(DISTINCT tr.work_order_id)::bigint,
    ROUND(AVG(tr.overall), 2),
    ROUND(AVG(tr.fit), 2),
    ROUND(AVG(tr.occlusion), 2),
    ROUND(AVG(tr.contacts), 2),
    ROUND(AVG(tr.esthetics), 2),
    ROUND(AVG(tr.surface), 2),
    ROUND(AVG(tr.on_time), 2)
  FROM tr JOIN profiles p ON p.id = tr.technician_id
  GROUP BY tr.technician_id, p.full_name
  ORDER BY 5 DESC NULLS LAST;
END;
$$;
