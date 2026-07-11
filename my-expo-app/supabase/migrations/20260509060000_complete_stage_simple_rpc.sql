-- ============================================================
-- 20260509 — complete_stage_simple RPC (acil unblock)
--
-- Sebep: Sunucudaki eski `confirm_stage_materials` 'done' enum
-- literal'i ile patlıyor. Teknisyenin RLS'i de status'u 'aktif'
-- dışına UPDATE etmesini engelliyor. Bu küçük SECURITY DEFINER RPC,
-- teknisyenin kendi aşamasını 'tamamlandi'ya geçirmesi için
-- minimal güvenli yol sağlar.
--
-- Faz B migration'ı uygulandığında transition_stage_state RPC'si
-- bunun yerine kullanılır; o zamana kadar client tarafı bu RPC'ye
-- fallback eder.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_stage_simple(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller        UUID := auth.uid();
  v_stage_tech    UUID;
  v_status        stage_status;
  v_user_type     TEXT;
  v_role          TEXT;
  v_work_order_id UUID;
  v_seq           INT;
  v_next_id       UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Aşamanın atanan teknisyeni + status + work_order_id + sequence
  SELECT technician_id, status, work_order_id, sequence_order
    INTO v_stage_tech, v_status, v_work_order_id, v_seq
  FROM public.order_stages WHERE id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage not found';
  END IF;

  -- Yetki: ya atanan teknisyen, ya manager/admin
  SELECT user_type, role INTO v_user_type, v_role
    FROM public.profiles WHERE id = v_caller;

  IF v_stage_tech <> v_caller
     AND NOT (v_user_type = 'admin')
     AND NOT (v_user_type = 'lab' AND v_role IN ('manager','admin'))
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Tamamla
  UPDATE public.order_stages
     SET status       = 'tamamlandi',
         completed_at = NOW()
   WHERE id = p_stage_id;

  -- Sıradaki bekleyen aşamayı aktif et
  SELECT id INTO v_next_id
    FROM public.order_stages
   WHERE work_order_id = v_work_order_id
     AND sequence_order > v_seq
     AND status = 'bekliyor'
   ORDER BY sequence_order
   LIMIT 1;

  IF v_next_id IS NOT NULL THEN
    UPDATE public.order_stages
       SET status      = 'aktif',
           assigned_at = COALESCE(assigned_at, NOW())
     WHERE id = v_next_id;

    UPDATE public.work_orders
       SET current_stage_id = v_next_id,
           status           = 'asamada'
     WHERE id = v_work_order_id;
  ELSE
    UPDATE public.work_orders
       SET current_stage_id = NULL,
           status           = 'kalite_kontrol'
     WHERE id = v_work_order_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_stage_simple(UUID) TO authenticated;
