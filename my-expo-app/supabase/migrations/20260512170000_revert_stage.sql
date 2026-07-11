-- ============================================================
-- 20260512170000 — Manager/admin: aktif aşamayı bir önceki tamamlanan
-- aşamaya geri al (rework akışı).
--
-- Davranış:
--   • current_stage_id'yi önceki tamamlanan satıra çevir
--   • Önceki: status 'tamamlandi'/'onaylandi' → 'aktif',
--     completed_at=NULL, started_at=NULL (teknisyen tekrar "İşe Başla"
--     diyebilsin, süre tahmini girer)
--   • Şu anki aktif aşama: status='bekliyor', started_at=NULL,
--     assigned_at korunur
--   • work_orders.status = 'asamada'
-- ============================================================

CREATE OR REPLACE FUNCTION public.revert_stage(
  p_order_id UUID
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_user_type  TEXT; v_role TEXT;
  v_current_id UUID; v_current_seq INT;
  v_prev_id    UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Aktif aşama
  SELECT id, sequence_order INTO v_current_id, v_current_seq
    FROM public.order_stages
   WHERE work_order_id = p_order_id AND status = 'aktif'
   ORDER BY sequence_order LIMIT 1;
  IF v_current_id IS NULL THEN
    RAISE EXCEPTION 'no active stage to revert from';
  END IF;

  -- Önceki tamamlanan (skip değil)
  SELECT id INTO v_prev_id
    FROM public.order_stages
   WHERE work_order_id = p_order_id
     AND sequence_order < v_current_seq
     AND status IN ('tamamlandi','onaylandi')
   ORDER BY sequence_order DESC
   LIMIT 1;
  IF v_prev_id IS NULL THEN
    RAISE EXCEPTION 'no previous completed stage';
  END IF;

  -- Şu anki aktifi 'bekliyor'a çek
  UPDATE public.order_stages
     SET status     = 'bekliyor',
         started_at = NULL
   WHERE id = v_current_id;

  -- Öncekini aktif yap
  UPDATE public.order_stages
     SET status       = 'aktif',
         completed_at = NULL,
         started_at   = NULL
   WHERE id = v_prev_id;

  UPDATE public.work_orders
     SET current_stage_id = v_prev_id,
         status           = 'asamada'
   WHERE id = p_order_id;

  RETURN v_prev_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revert_stage(UUID) TO authenticated;
