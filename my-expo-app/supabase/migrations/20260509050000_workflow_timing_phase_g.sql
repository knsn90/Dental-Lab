-- ============================================================
-- 20260509 — Workflow Timing Phase G: Machine integration scaffolding
--
-- Hedef: Gerçek makineleri (Zirkonzahn M5, Medit, Exocad, 3Shape, fırın
-- telemetri vs.) gelecekte entegre etmek için altyapıyı kurmak.
-- Şu an adapter'lar mock — gerçek API yok ama architecture hazır.
--
-- Yaklaşım:
--   • Mevcut `equipment` tablosunu integration kolonlarıyla genişlet
--   • machine_events tablosu — heartbeat / job_started / job_completed
--   • record_machine_event RPC — event log + equipment status + stage runtime
--
-- UI/TypeScript adapters bu RPC'yi çağırır; mock veya gerçek olabilir.
-- ============================================================

-- ── 1. Equipment integration kolonları ─────────────────────────
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS integration_kind     TEXT,
  ADD COLUMN IF NOT EXISTS endpoint_url         TEXT,
  ADD COLUMN IF NOT EXISTS credentials_ref      TEXT,
  ADD COLUMN IF NOT EXISTS live_status          TEXT DEFAULT 'unknown'
    CHECK (live_status IN ('unknown','idle','running','error','maintenance','offline')),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_stage_id     UUID REFERENCES public.order_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_job_started_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_job_estimate_seconds   INTEGER,
  ADD COLUMN IF NOT EXISTS last_error_message    TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.equipment.integration_kind IS
  'Adapter tipi: mock, medit, exocad, zirkonzahn_m5, 3shape, generic_ocr — TS adapter registry buna bakar.';
COMMENT ON COLUMN public.equipment.live_status IS
  'Gerçek-zamanlı durum (heartbeat ile güncellenir): unknown/idle/running/error/maintenance/offline.';
COMMENT ON COLUMN public.equipment.credentials_ref IS
  'Vault/secret reference — gerçek API key DB''de saklanmaz.';

-- Heartbeat eskidiği için indeks (offline tespiti)
CREATE INDEX IF NOT EXISTS idx_equipment_heartbeat
  ON public.equipment(last_heartbeat_at)
  WHERE integration_kind IS NOT NULL;

-- ── 2. machine_events log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.machine_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  stage_id        UUID REFERENCES public.order_stages(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,                -- heartbeat, job_started, job_completed, error, status_changed
  payload         JSONB,
  runtime_seconds INTEGER,                       -- job_completed için
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_events_equipment ON public.machine_events (equipment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_events_stage     ON public.machine_events (stage_id) WHERE stage_id IS NOT NULL;

-- RLS
ALTER TABLE public.machine_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine_events_read" ON public.machine_events;
CREATE POLICY "machine_events_read"
  ON public.machine_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.equipment e WHERE e.id = machine_events.equipment_id
  ));

-- INSERT/UPDATE policy yok — sadece SECURITY DEFINER RPC

-- ── 3. record_machine_event RPC ───────────────────────────────
-- Adapter tarafından (mock veya gerçek) çağrılır.
-- 1) machine_events log'a yazar
-- 2) equipment.live_status / heartbeat / current_stage'i günceller
-- 3) job_completed ise: stage'in machine_runtime_seconds'ına ekler
--    + stage_activity_events'e source='machine_api' event yazar
CREATE OR REPLACE FUNCTION public.record_machine_event(
  p_equipment_id    UUID,
  p_event_type      TEXT,
  p_stage_id        UUID DEFAULT NULL,
  p_payload         JSONB DEFAULT NULL,
  p_runtime_seconds INTEGER DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_caller   UUID := auth.uid();
BEGIN
  -- Auth gerek (gerçek makine entegrasyonunda service-role token olur)
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required';
  END IF;

  -- 1) machine_events log
  INSERT INTO public.machine_events (equipment_id, stage_id, event_type, payload, runtime_seconds)
  VALUES (p_equipment_id, p_stage_id, p_event_type, p_payload, p_runtime_seconds)
  RETURNING id INTO v_event_id;

  -- 2) equipment.live_status + heartbeat güncelle
  UPDATE public.equipment SET
    last_heartbeat_at = NOW(),
    live_status = CASE p_event_type
      WHEN 'heartbeat'      THEN COALESCE(NULLIF(p_payload->>'status', ''), live_status)
      WHEN 'job_started'    THEN 'running'
      WHEN 'job_completed'  THEN 'idle'
      WHEN 'error'          THEN 'error'
      WHEN 'status_changed' THEN COALESCE(NULLIF(p_payload->>'status', ''), live_status)
      ELSE live_status
    END,
    current_stage_id = CASE p_event_type
      WHEN 'job_started'    THEN p_stage_id
      WHEN 'job_completed'  THEN NULL
      ELSE current_stage_id
    END,
    current_job_started_at = CASE p_event_type
      WHEN 'job_started'    THEN NOW()
      WHEN 'job_completed'  THEN NULL
      ELSE current_job_started_at
    END,
    current_job_estimate_seconds = CASE p_event_type
      WHEN 'job_started' THEN COALESCE((p_payload->>'estimate_seconds')::INTEGER, current_job_estimate_seconds)
      WHEN 'job_completed' THEN NULL
      ELSE current_job_estimate_seconds
    END,
    last_error_message = CASE p_event_type
      WHEN 'error' THEN p_payload->>'message'
      ELSE last_error_message
    END,
    last_error_at = CASE p_event_type
      WHEN 'error' THEN NOW()
      ELSE last_error_at
    END
  WHERE id = p_equipment_id;

  -- 3) job_completed ise stage'e runtime ekle + activity event
  IF p_event_type = 'job_completed' AND p_stage_id IS NOT NULL AND p_runtime_seconds IS NOT NULL THEN
    UPDATE public.order_stages
    SET machine_runtime_seconds = machine_runtime_seconds + p_runtime_seconds,
        last_activity_at = NOW(),
        first_activity_at = COALESCE(first_activity_at, NOW())
    WHERE id = p_stage_id;

    INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
    VALUES (
      p_stage_id,
      'machine_job_completed',
      'machine_api',
      jsonb_build_object(
        'equipment_id',     p_equipment_id,
        'runtime_seconds',  p_runtime_seconds,
        'extra',            p_payload
      ),
      v_caller
    );
  ELSIF p_event_type = 'job_started' AND p_stage_id IS NOT NULL THEN
    -- Job started — stage activity event
    INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
    VALUES (
      p_stage_id,
      'machine_job_started',
      'machine_api',
      jsonb_build_object('equipment_id', p_equipment_id, 'extra', p_payload),
      v_caller
    );
  ELSIF p_event_type = 'error' AND p_stage_id IS NOT NULL THEN
    INSERT INTO public.stage_activity_events (stage_id, event_type, source, payload, actor_id)
    VALUES (
      p_stage_id,
      'machine_error',
      'machine_api',
      jsonb_build_object('equipment_id', p_equipment_id, 'extra', p_payload),
      v_caller
    );
  END IF;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_machine_event(UUID, TEXT, UUID, JSONB, INTEGER) TO authenticated;

-- ── 4. Live machine status view (workstation için) ─────────────
CREATE OR REPLACE VIEW public.machine_live_status AS
SELECT
  e.id                              AS equipment_id,
  e.lab_id,
  e.station_id,
  e.name,
  e.brand,
  e.model,
  e.category,
  e.integration_kind,
  e.live_status,
  e.last_heartbeat_at,
  e.current_stage_id,
  e.current_job_started_at,
  e.current_job_estimate_seconds,
  e.last_error_message,
  e.last_error_at,
  -- Heartbeat tazeliği
  CASE
    WHEN e.last_heartbeat_at IS NULL                              THEN 'never'
    WHEN e.last_heartbeat_at >= NOW() - INTERVAL '60 seconds'     THEN 'fresh'
    WHEN e.last_heartbeat_at >= NOW() - INTERVAL '5 minutes'      THEN 'stale'
    ELSE                                                                'offline'
  END AS heartbeat_freshness,
  -- ETA hesabı
  CASE
    WHEN e.current_job_started_at IS NOT NULL AND e.current_job_estimate_seconds IS NOT NULL
    THEN e.current_job_started_at + (e.current_job_estimate_seconds || ' seconds')::INTERVAL
    ELSE NULL
  END AS estimated_completion_at,
  -- Şu ana kadar geçen runtime
  CASE
    WHEN e.current_job_started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - e.current_job_started_at))::INTEGER
    ELSE NULL
  END AS current_runtime_seconds
FROM public.equipment e
WHERE e.integration_kind IS NOT NULL;

COMMENT ON VIEW public.machine_live_status IS
  'Entegre edilmiş makinelerin canlı durumu — heartbeat + job ETA. Workstation MachineStatusCard kullanır.';
