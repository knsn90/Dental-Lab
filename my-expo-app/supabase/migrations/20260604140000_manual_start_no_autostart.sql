-- ============================================================
-- FAZ 1 — Manuel "İŞE BAŞLA" + doğru kuyruk süresi.
--
-- SORUN: _stage_timing_handler trigger'ının A bloğu, aşama bekliyor→aktif
-- olduğunda (planlama onayı / önceki aşama bitince) started_at = NOW() set
-- edip çalışma sayacını otomatik başlatıyordu. Böylece teknisyenin "İŞE BAŞLA"
-- butonu devre dışı kalıyor ve queue_waiting_seconds hep 0 oluyordu.
--
-- ÇÖZÜM:
--   1) Trigger A bloğu artık started_at / queue_waiting / last_active_started_at
--      OTOMATİK SET ETMEZ. Aşama 'aktif' = "atandı, kuyrukta, başlamayı bekliyor".
--   2) start_stage_simple (İŞE BAŞLA) started_at + queue_waiting'e ek olarak
--      last_active_started_at = NOW() set eder → aktif süre manuel start'tan akar.
--
-- approve_triage / triage_order zaten started_at=NULL bırakıyor;
-- complete_stage_simple'ın manuel-istasyon yolu da started_at=NULL bırakıyor
-- (auto_progress=true makine istasyonları hariç — onlar zaten anında tamamlanır).
-- Yani sadece trigger + start_stage_simple değişiyor.
-- ============================================================

CREATE OR REPLACE FUNCTION public._stage_timing_handler()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_active_delta INTEGER;
  v_pause_delta  INTEGER;
BEGIN
  -- Status değişmediyse dokunma
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ── A) bekliyor → aktif: İŞ KUYRUĞA GİRDİ ──────────────────
  -- started_at / queue_waiting / last_active_started_at OTOMATİK BAŞLAMAZ.
  -- Bunlar yalnız teknisyen "İŞE BAŞLA"ya basınca (start_stage_simple) set edilir.
  IF OLD.status = 'bekliyor' AND NEW.status = 'aktif' THEN
    RETURN NEW;
  END IF;

  -- ── B) aktif → durakladi/makine/onay/bloklu/yeniden ────────
  IF OLD.status = 'aktif'
     AND NEW.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden') THEN
    IF OLD.last_active_started_at IS NOT NULL THEN
      v_active_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.last_active_started_at))::INTEGER);
      NEW.active_work_seconds := OLD.active_work_seconds + v_active_delta;
    END IF;
    NEW.last_active_started_at := NULL;
    IF NEW.status = 'durakladi' THEN
      NEW.paused_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  -- ── C) durakladi/wait/blocked/rework → aktif (resume) ──────
  IF OLD.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     AND NEW.status = 'aktif' THEN
    IF OLD.status = 'durakladi' AND OLD.paused_at IS NOT NULL THEN
      v_pause_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.paused_at))::INTEGER);
      NEW.paused_seconds_total := OLD.paused_seconds_total + v_pause_delta;
      NEW.paused_at := NULL;
    END IF;
    NEW.last_active_started_at := NOW();
    RETURN NEW;
  END IF;

  -- ── D) aktif → tamamlandi ──────────────────────────────────
  IF OLD.status = 'aktif' AND NEW.status = 'tamamlandi' THEN
    IF OLD.last_active_started_at IS NOT NULL THEN
      v_active_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.last_active_started_at))::INTEGER);
      NEW.active_work_seconds := OLD.active_work_seconds + v_active_delta;
    END IF;
    NEW.last_active_started_at := NULL;
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  -- ── E) bekleme/blok/rework → tamamlandi ────────────────────
  IF OLD.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     AND NEW.status = 'tamamlandi' THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
    NEW.last_active_started_at := NULL;
    NEW.paused_at := NULL;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;


-- start_stage_simple — manuel start anında last_active_started_at de set et,
-- böylece active_work_seconds bu andan itibaren birikir (trigger B/D kullanır).
CREATE OR REPLACE FUNCTION public.start_stage_simple(p_stage_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     UUID := auth.uid();
  v_tech       UUID;
  v_status     stage_status;
  v_started    TIMESTAMPTZ;
  v_assigned   TIMESTAMPTZ;
  v_user_type  TEXT;
  v_role       TEXT;
  v_wait_secs  INT;
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
