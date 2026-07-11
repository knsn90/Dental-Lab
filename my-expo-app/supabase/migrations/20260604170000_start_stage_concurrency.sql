-- ============================================================
-- FAZ 3 — "İŞE BAŞLA"da eşzamanlı iş limiti (labs.max_active_jobs_per_tech).
-- Bir teknisyenin aynı anda başlamış (aktif + started_at) iş sayısı limiti aşamaz.
-- Varsayılan 1; makineli lab'larda admin Ayarlar'dan artırır.
-- (Faz 1'deki manuel-start davranışı korunur: started_at + last_active + queue_waiting.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_stage_simple(p_stage_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       UUID := auth.uid();
  v_tech         UUID;
  v_status       stage_status;
  v_started      TIMESTAMPTZ;
  v_assigned     TIMESTAMPTZ;
  v_user_type    TEXT;
  v_role         TEXT;
  v_wait_secs    INT;
  v_owner        UUID;
  v_max          INT;
  v_active_count INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, started_at, assigned_at
    INTO v_tech, v_status, v_started, v_assigned
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_tech IS NOT NULL AND v_tech <> v_caller
     AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Idempotent: zaten başlamışsa noop
  IF v_started IS NOT NULL THEN RETURN TRUE; END IF;

  v_owner := COALESCE(v_tech, v_caller);

  -- Eşzamanlı iş limiti (lab ayarı)
  SELECT COALESCE(l.max_active_jobs_per_tech, 1)
    INTO v_max
    FROM public.profiles p
    LEFT JOIN public.labs l ON l.id = p.lab_id
   WHERE p.id = v_owner;
  v_max := COALESCE(v_max, 1);

  SELECT count(*) INTO v_active_count
    FROM public.order_stages
   WHERE technician_id = v_owner
     AND status = 'aktif'
     AND started_at IS NOT NULL
     AND id <> p_stage_id;

  IF v_active_count >= v_max THEN
    RAISE EXCEPTION 'Aynı anda en fazla % aktif iş yürütebilirsiniz. Önce birini tamamlayın veya duraklatın.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  -- Kuyruk bekleme süresi = NOW() - assigned_at
  v_wait_secs := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_assigned, NOW())))::INT);

  UPDATE public.order_stages
     SET started_at             = NOW(),
         last_active_started_at  = NOW(),
         technician_id           = COALESCE(technician_id, v_caller),
         queue_waiting_seconds   = COALESCE(queue_waiting_seconds, 0) + v_wait_secs
   WHERE id = p_stage_id;

  RETURN TRUE;
END;
$function$;
