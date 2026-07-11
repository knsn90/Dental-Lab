-- ============================================================
-- 20260509 — Workflow Timing Phase B: Sunucu mantığı
--
-- Amaç:
--   • Status değişimlerinde otomatik timing math (BEFORE UPDATE trigger)
--   • Activity event kaydı için RPC
--   • Pause / resume RPC'leri
--   • Generic state transition RPC'si
--   • Manual timing override RPC'si (audit'li)
--
-- Phase A'da eklenen yeni enum değerlerini kullanır — ayrı migration olmak
-- zorunda (PG: "unsafe use of new enum value in same transaction").
-- ============================================================

-- ───────────────────────────────────────────────────────────────
-- 1. TIMING TRIGGER — status değişimlerinde otomatik bookkeeping
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._stage_timing_handler()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_active_delta INTEGER;
  v_pause_delta  INTEGER;
  v_queue_delta  INTEGER;
BEGIN
  -- Status değişmediyse dokunma
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ── A) bekliyor → aktif (ilk kez başlıyor) ─────────────────
  IF OLD.status = 'bekliyor' AND NEW.status = 'aktif' THEN
    IF NEW.started_at IS NULL THEN
      NEW.started_at := NOW();
    END IF;
    -- Queue waiting süresi
    IF OLD.assigned_at IS NOT NULL AND NEW.queue_waiting_seconds = OLD.queue_waiting_seconds THEN
      v_queue_delta := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - OLD.assigned_at))::INTEGER);
      NEW.queue_waiting_seconds := v_queue_delta;
    END IF;
    NEW.last_active_started_at := NOW();
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

  -- ── E) bekleme/blok/rework → tamamlandi (pause sırasında biten iş) ──
  IF OLD.status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden')
     AND NEW.status = 'tamamlandi' THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
    -- active_work_seconds zaten önceki çıkışta birikti, dokunma
    NEW.last_active_started_at := NULL;
    NEW.paused_at := NULL;
    RETURN NEW;
  END IF;

  -- ── F) tamamlandi/onaylandi → diğer (resume after complete) ─────
  -- Bu nadir kullanılır, sadece manual override durumu. Trigger logic uygulamaz.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ts_stage_timing ON public.order_stages;
CREATE TRIGGER ts_stage_timing
  BEFORE UPDATE OF status ON public.order_stages
  FOR EACH ROW
  EXECUTE FUNCTION public._stage_timing_handler();

-- ───────────────────────────────────────────────────────────────
-- 2. RPC: record_stage_activity — event log + first/last update
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_stage_activity(
  p_stage_id   UUID,
  p_event_type TEXT,
  p_source     TEXT DEFAULT 'system',
  p_payload    JSONB DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_caller   UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_source NOT IN ('manual','system','machine_api') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required';
  END IF;

  INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
  VALUES (p_stage_id, p_event_type, p_source, p_payload, v_caller)
  RETURNING id INTO v_event_id;

  UPDATE public.order_stages
  SET first_activity_at = COALESCE(first_activity_at, NOW()),
      last_activity_at  = NOW()
  WHERE id = p_stage_id;

  RETURN v_event_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 3. RPC: pause_stage / resume_stage
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_stage(
  p_stage_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current  stage_status;
  v_caller   UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT status INTO v_current FROM public.order_stages WHERE id = p_stage_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'stage not found';
  END IF;
  IF v_current <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif to pause (current: %)', v_current;
  END IF;

  UPDATE public.order_stages SET status = 'durakladi' WHERE id = p_stage_id;

  INSERT INTO public.stage_state_transitions (stage_id, from_status, to_status, reason, actor_id)
  VALUES (p_stage_id, v_current, 'durakladi', p_reason, v_caller);

  INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
  VALUES (p_stage_id, 'stage_paused', 'manual', jsonb_build_object('reason', p_reason), v_caller);

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_stage(
  p_stage_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current  stage_status;
  v_caller   UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT status INTO v_current FROM public.order_stages WHERE id = p_stage_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'stage not found';
  END IF;
  IF v_current NOT IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden') THEN
    RAISE EXCEPTION 'stage cannot be resumed from %', v_current;
  END IF;

  UPDATE public.order_stages SET status = 'aktif' WHERE id = p_stage_id;

  INSERT INTO public.stage_state_transitions (stage_id, from_status, to_status, reason, actor_id)
  VALUES (p_stage_id, v_current, 'aktif', p_reason, v_caller);

  INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
  VALUES (p_stage_id, 'stage_resumed', 'manual', jsonb_build_object('reason', p_reason, 'from', v_current), v_caller);

  RETURN TRUE;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. RPC: transition_stage_state — generic
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_stage_state(
  p_stage_id   UUID,
  p_new_status stage_status,
  p_reason     TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current stage_status;
  v_caller  UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT status INTO v_current FROM public.order_stages WHERE id = p_stage_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'stage not found';
  END IF;
  IF v_current = p_new_status THEN
    RETURN FALSE;
  END IF;

  -- transition_stage_state hayatta kalacak transitions:
  -- aktif ↔ durakladi/makine_bekliyor/onay_bekliyor/bloklu/yeniden
  -- aktif → tamamlandi
  -- bekliyor → aktif
  IF p_new_status NOT IN (
    'aktif','durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden','tamamlandi'
  ) THEN
    RAISE EXCEPTION 'transition not allowed via this RPC: %', p_new_status;
  END IF;

  UPDATE public.order_stages SET status = p_new_status WHERE id = p_stage_id;

  INSERT INTO public.stage_state_transitions (stage_id, from_status, to_status, reason, actor_id)
  VALUES (p_stage_id, v_current, p_new_status, p_reason, v_caller);

  INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
  VALUES (
    p_stage_id,
    'stage_state_changed',
    'manual',
    jsonb_build_object('from', v_current, 'to', p_new_status, 'reason', p_reason),
    v_caller
  );

  RETURN TRUE;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 5. RPC: override_stage_timing — manuel düzeltme, audit'li
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.override_stage_timing(
  p_stage_id   UUID,
  p_field_name TEXT,
  p_new_value  INTEGER,
  p_reason     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_old_value INTEGER;
  v_caller    UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'override requires a reason (min 3 chars)';
  END IF;
  IF p_field_name NOT IN (
    'active_work_seconds','machine_runtime_seconds','operator_setup_seconds','queue_waiting_seconds'
  ) THEN
    RAISE EXCEPTION 'override field not allowed: %', p_field_name;
  END IF;
  IF p_new_value < 0 THEN
    RAISE EXCEPTION 'override value must be >= 0';
  END IF;

  -- Eski değer
  EXECUTE format('SELECT %I FROM public.order_stages WHERE id = $1', p_field_name)
    INTO v_old_value
    USING p_stage_id;

  IF v_old_value IS NULL THEN
    -- Stage yoksa veya kolon NULL ise (ki NOT NULL DEFAULT 0 olduğu için olmamalı)
    RAISE EXCEPTION 'stage not found or field unreadable';
  END IF;

  -- Audit
  INSERT INTO public.stage_timing_overrides (stage_id, field_name, old_value, new_value, reason, actor_id)
  VALUES (p_stage_id, p_field_name, v_old_value, p_new_value, p_reason, v_caller);

  -- Update
  EXECUTE format('UPDATE public.order_stages SET %I = $1 WHERE id = $2', p_field_name)
    USING p_new_value, p_stage_id;

  -- Event olarak da kaydet (analytics için)
  INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
  VALUES (
    p_stage_id,
    'timing_overridden',
    'manual',
    jsonb_build_object('field', p_field_name, 'old', v_old_value, 'new', p_new_value, 'reason', p_reason),
    v_caller
  );

  RETURN TRUE;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 6. GRANT — authenticated users tüm RPC'leri çağırabilsin
-- ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.record_stage_activity(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_stage(UUID, TEXT)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_stage(UUID, TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_stage_state(UUID, stage_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_stage_timing(UUID, TEXT, INTEGER, TEXT) TO authenticated;
