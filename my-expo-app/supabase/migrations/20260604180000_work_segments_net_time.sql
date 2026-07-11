-- ============================================================
-- FAZ 4a — Çalışma segmentleri + takvimle NET süre (analiz kaynağı).
--
-- stage_work_segments: her aktif çalışma aralığı bir satır (başla/devam → durdur/tamamla).
-- stage_net_work_seconds(stage): segmentlerin lab çalışma pencerelerine düşen toplamı
--   = mesai dışı + öğle + gece otomatik düşülmüş NET çalışma süresi (iş gece açık kalsa bile doğru).
--
-- Segment açma/kapama:
--   • start_stage_simple (manuel İŞE BAŞLA) → ilk segment açılır.
--   • trigger C (durakladi/… → aktif resume) → yeni segment açılır.
--   • trigger B (aktif → durakladi/…) ve D (aktif → tamamlandi) → açık segment kapatılır.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stage_work_segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    UUID NOT NULL REFERENCES public.order_stages(id) ON DELETE CASCADE,
  lab_id      UUID,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_segments_stage ON public.stage_work_segments (stage_id);
CREATE INDEX IF NOT EXISTS idx_work_segments_open  ON public.stage_work_segments (stage_id) WHERE ended_at IS NULL;

ALTER TABLE public.stage_work_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_segments_select ON public.stage_work_segments;
CREATE POLICY work_segments_select ON public.stage_work_segments
  FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE user_type IN ('lab','admin')));

-- ── Trigger: mevcut zamanlama + SEGMENT loglama ──────────────────────────────
CREATE OR REPLACE FUNCTION public._stage_timing_handler()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_active_delta INTEGER;
  v_pause_delta  INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- A) bekliyor → aktif: KUYRUĞA GİRDİ — başlatma yok
  IF OLD.status = 'bekliyor' AND NEW.status = 'aktif' THEN
    RETURN NEW;
  END IF;

  -- B) aktif → durakladi/…: aktif süre biriktir + açık segmenti kapat
  IF OLD.status = 'aktif'
     AND NEW.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden') THEN
    IF OLD.last_active_started_at IS NOT NULL THEN
      v_active_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.last_active_started_at))::INTEGER);
      NEW.active_work_seconds := OLD.active_work_seconds + v_active_delta;
    END IF;
    NEW.last_active_started_at := NULL;
    IF NEW.status = 'durakladi' THEN NEW.paused_at := NOW(); END IF;
    UPDATE public.stage_work_segments SET ended_at = NOW()
     WHERE stage_id = NEW.id AND ended_at IS NULL;
    RETURN NEW;
  END IF;

  -- C) durakladi/… → aktif (resume): yeni segment aç
  IF OLD.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     AND NEW.status = 'aktif' THEN
    IF OLD.status = 'durakladi' AND OLD.paused_at IS NOT NULL THEN
      v_pause_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.paused_at))::INTEGER);
      NEW.paused_seconds_total := OLD.paused_seconds_total + v_pause_delta;
      NEW.paused_at := NULL;
    END IF;
    NEW.last_active_started_at := NOW();
    INSERT INTO public.stage_work_segments (stage_id, lab_id, started_at)
    VALUES (NEW.id, (SELECT lab_id FROM public.profiles WHERE id = NEW.technician_id), NOW());
    RETURN NEW;
  END IF;

  -- D) aktif → tamamlandi: aktif süre biriktir + açık segmenti kapat
  IF OLD.status = 'aktif' AND NEW.status = 'tamamlandi' THEN
    IF OLD.last_active_started_at IS NOT NULL THEN
      v_active_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.last_active_started_at))::INTEGER);
      NEW.active_work_seconds := OLD.active_work_seconds + v_active_delta;
    END IF;
    NEW.last_active_started_at := NULL;
    IF NEW.completed_at IS NULL THEN NEW.completed_at := NOW(); END IF;
    UPDATE public.stage_work_segments SET ended_at = NOW()
     WHERE stage_id = NEW.id AND ended_at IS NULL;
    RETURN NEW;
  END IF;

  -- E) bekleme/blok → tamamlandi
  IF OLD.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     AND NEW.status = 'tamamlandi' THEN
    IF NEW.completed_at IS NULL THEN NEW.completed_at := NOW(); END IF;
    NEW.last_active_started_at := NULL;
    NEW.paused_at := NULL;
    UPDATE public.stage_work_segments SET ended_at = NOW()
     WHERE stage_id = NEW.id AND ended_at IS NULL;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── start_stage_simple: Faz1 manuel-start + Faz3 limit + ilk SEGMENT ─────────
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
  v_lab          UUID;
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

  IF v_status <> 'aktif' THEN RAISE EXCEPTION 'stage must be aktif (current: %)', v_status; END IF;
  IF v_started IS NOT NULL THEN RETURN TRUE; END IF;

  v_owner := COALESCE(v_tech, v_caller);

  SELECT COALESCE(l.max_active_jobs_per_tech, 1), p.lab_id
    INTO v_max, v_lab
    FROM public.profiles p LEFT JOIN public.labs l ON l.id = p.lab_id
   WHERE p.id = v_owner;
  v_max := COALESCE(v_max, 1);

  SELECT count(*) INTO v_active_count
    FROM public.order_stages
   WHERE technician_id = v_owner AND status = 'aktif' AND started_at IS NOT NULL AND id <> p_stage_id;

  IF v_active_count >= v_max THEN
    RAISE EXCEPTION 'Aynı anda en fazla % aktif iş yürütebilirsiniz. Önce birini tamamlayın veya duraklatın.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  v_wait_secs := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_assigned, NOW())))::INT);

  UPDATE public.order_stages
     SET started_at             = NOW(),
         last_active_started_at  = NOW(),
         technician_id           = COALESCE(technician_id, v_caller),
         queue_waiting_seconds   = COALESCE(queue_waiting_seconds, 0) + v_wait_secs
   WHERE id = p_stage_id;

  -- İlk çalışma segmenti
  INSERT INTO public.stage_work_segments (stage_id, lab_id, started_at)
  VALUES (p_stage_id, v_lab, NOW());

  RETURN TRUE;
END;
$function$;

-- ── NET çalışma süresi (takvimle): segmentlerin çalışma pencerelerine düşen toplamı ──
CREATE OR REPLACE FUNCTION public.stage_net_work_seconds(p_stage_id uuid)
RETURNS bigint
LANGUAGE sql STABLE AS $function$
  SELECT COALESCE(SUM(
    public.lab_working_seconds(s.lab_id, s.started_at, COALESCE(s.ended_at, NOW()))
  ), 0)::bigint
  FROM public.stage_work_segments s
  WHERE s.stage_id = p_stage_id AND s.lab_id IS NOT NULL;
$function$;

NOTIFY pgrst, 'reload schema';
