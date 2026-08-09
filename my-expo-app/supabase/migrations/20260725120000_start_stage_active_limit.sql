-- 20260725120000_start_stage_active_limit.sql
--
-- Teknisyen geri bildirimi: "işi fırına verdiğimde beklemeden başka işe geçmek istiyorum
-- (porselen fırını, kürleme cihazı vs.)."
--
-- Sorun: eşzamanlı iş limiti (labs.max_active_jobs_per_tech, varsayılan 1) SADECE
-- start_stage_simple(uuid) tek-argümanlı versiyonunda vardı. İstemci her zaman
-- start_stage_simple(uuid, integer) 2-argümanlı overload'ını çağırıyor (p_estimated_minutes
-- hep gönderiliyor) ve o versiyonda kontrol YOKTU → limit fiilen atlanıyordu.
--
-- Çözüm modeli: "elde aynı anda 1 aktif iş" (lab başına ayarlanabilir), AMA makineye/fırına
-- verilen (makine_bekliyor) ve duraklatılan (durakladi) işler SAYILMAZ — çünkü status
-- 'aktif' değildir. Böylece teknisyen işi "Makineye Ver" ile parklar, hemen sonrakini
-- başlatır. Sayım yalnız gerçekten elde çalışılan işleri (status='aktif' AND started_at
-- IS NOT NULL) kapsar.
--
-- Bu migration yalnız 2-argümanlı versiyona kontrolü ekler; hedef/timing mantığı aynı.

CREATE OR REPLACE FUNCTION public.start_stage_simple(p_stage_id uuid, p_estimated_minutes integer DEFAULT NULL::integer)
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

  -- Idempotent: zaten başlamışsa timing değişmez, yalnız estimated güncellenebilir.
  -- (Yeni slot açılmadığı için limit kontrolü de gerekmez.)
  IF v_started IS NOT NULL THEN
    IF p_estimated_minutes IS NOT NULL THEN
      UPDATE public.order_stages
         SET estimated_minutes = GREATEST(1, p_estimated_minutes)
       WHERE id = p_stage_id;
    END IF;
    RETURN TRUE;
  END IF;

  -- ── Eşzamanlı ELDE-AKTİF iş limiti ──
  -- Yalnız status='aktif' AND started_at dolu işler sayılır; makine_bekliyor / durakladi
  -- (fırın/kürleme/mola) SAYILMAZ → teknisyen makinedeki işi parklayıp sonrakini başlatır.
  v_owner := COALESCE(v_tech, v_caller);
  SELECT COALESCE(l.max_active_jobs_per_tech, 1) INTO v_max
    FROM public.profiles p LEFT JOIN public.labs l ON l.id = p.lab_id
   WHERE p.id = v_owner;
  v_max := COALESCE(v_max, 1);

  SELECT count(*) INTO v_active_count
    FROM public.order_stages
   WHERE technician_id = v_owner
     AND status = 'aktif'
     AND started_at IS NOT NULL
     AND id <> p_stage_id;

  IF v_active_count >= v_max THEN
    RAISE EXCEPTION 'Aynı anda en fazla % aktif iş yürütebilirsiniz. Fırın/makinedeki işi "Makineye Ver" ile parklayın ya da birini tamamlayın.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  v_wait_secs := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_assigned, NOW())))::INT);

  UPDATE public.order_stages
     SET started_at            = NOW(),
         technician_id         = COALESCE(technician_id, v_caller),
         queue_waiting_seconds = COALESCE(queue_waiting_seconds, 0) + v_wait_secs,
         estimated_minutes     = CASE
           WHEN p_estimated_minutes IS NOT NULL THEN GREATEST(1, p_estimated_minutes)
           ELSE estimated_minutes
         END
   WHERE id = p_stage_id;

  RETURN TRUE;
END;
$function$;
