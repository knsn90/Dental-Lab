-- ============================================================
-- 20260509 — Workflow Timing Phase A: Veri katmanı
--
-- Amaç:
--   • stage_status enum'unu üretim-grade state'lerle genişlet
--   • order_stages'e gerçek timing kolonları ekle (active vs elapsed,
--     machine vs human, queue waiting)
--   • Activity event log + state audit + timing override tabloları
--   • Confidence view
--
-- ÖNEMLİ: Bu migration sadece enum + kolon + tablo ekler.
-- Yeni enum değerlerini kullanan RPC ve trigger Phase B'de gelir
-- (PG: "unsafe use of new enum value in same transaction").
-- ============================================================

-- ── 1. Enum genişlet ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'durakladi'      AND enumtypid = 'stage_status'::regtype) THEN ALTER TYPE stage_status ADD VALUE 'durakladi';      END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'makine_bekliyor' AND enumtypid = 'stage_status'::regtype) THEN ALTER TYPE stage_status ADD VALUE 'makine_bekliyor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'onay_bekliyor'   AND enumtypid = 'stage_status'::regtype) THEN ALTER TYPE stage_status ADD VALUE 'onay_bekliyor';   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'bloklu'          AND enumtypid = 'stage_status'::regtype) THEN ALTER TYPE stage_status ADD VALUE 'bloklu';          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'yeniden'         AND enumtypid = 'stage_status'::regtype) THEN ALTER TYPE stage_status ADD VALUE 'yeniden';         END IF;
END $$;

-- ── 2. order_stages timing kolonları ──────────────────────────
ALTER TABLE public.order_stages
  -- İlk operatör aktivitesi (ilk file upload, ilk event vs.)
  ADD COLUMN IF NOT EXISTS first_activity_at TIMESTAMPTZ,
  -- Son aktivite (idle bottleneck tespiti için)
  ADD COLUMN IF NOT EXISTS last_activity_at  TIMESTAMPTZ,

  -- Aktif çalışma süresi (saniye) — pause çıkarılmış
  ADD COLUMN IF NOT EXISTS active_work_seconds      INTEGER NOT NULL DEFAULT 0,
  -- Makine runtime (frezeleme, baskı, sinter vs.)
  ADD COLUMN IF NOT EXISTS machine_runtime_seconds  INTEGER NOT NULL DEFAULT 0,
  -- Operatör hazırlık süresi (frez takma, makineye yükleme)
  ADD COLUMN IF NOT EXISTS operator_setup_seconds   INTEGER NOT NULL DEFAULT 0,
  -- Kuyruk bekleme süresi (assigned_at → started_at)
  ADD COLUMN IF NOT EXISTS queue_waiting_seconds    INTEGER NOT NULL DEFAULT 0,

  -- Pause state — şu an pause'da ise paused_at, toplam pause biriktirir
  ADD COLUMN IF NOT EXISTS paused_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_seconds_total     INTEGER NOT NULL DEFAULT 0,
  -- Aktif segmentin başladığı an — pause/resume için bookkeeping
  -- Status 'aktif' iken NOT NULL; pause/done olunca NULL
  ADD COLUMN IF NOT EXISTS last_active_started_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.order_stages.active_work_seconds IS
  'Operatörün gerçekten çalıştığı toplam saniye. Pause çıkarılmıştır.';
COMMENT ON COLUMN public.order_stages.machine_runtime_seconds IS
  'Makinenin işi sürdürdüğü süre (operatör beklemiyor, makine çalışıyor).';
COMMENT ON COLUMN public.order_stages.queue_waiting_seconds IS
  'Stage''in bekliyor durumunda atandığı andan başladığı ana kadar geçen süre.';
COMMENT ON COLUMN public.order_stages.last_active_started_at IS
  'Aktif segmentin başladığı an. Pause/state-change anında çıkarılıp active_work_seconds biriktirilir.';

-- ── 3. Activity event log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stage_activity_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id     UUID NOT NULL REFERENCES public.order_stages(id) ON DELETE CASCADE,
  -- Event türü (semantik): 'stl_uploaded', 'file_opened', 'export_created',
  -- 'revision_saved', 'print_started', 'machine_job_sent', 'qc_approved',
  -- 'material_confirmed', 'note_added', 'photo_added', vb.
  event_type   TEXT NOT NULL,
  -- Kaynak: manual = kullanıcı butonu; system = otomatik UI olayı; machine_api = harici makine entegrasyonu
  source       TEXT NOT NULL CHECK (source IN ('manual', 'system', 'machine_api')),
  payload      JSONB,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_activity_events_stage  ON public.stage_activity_events (stage_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_activity_events_type   ON public.stage_activity_events (event_type);
CREATE INDEX IF NOT EXISTS idx_stage_activity_events_source ON public.stage_activity_events (source);

-- ── 4. State transition audit ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stage_state_transitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id     UUID NOT NULL REFERENCES public.order_stages(id) ON DELETE CASCADE,
  from_status  stage_status,
  to_status    stage_status NOT NULL,
  reason       TEXT,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_state_transitions_stage ON public.stage_state_transitions (stage_id, occurred_at DESC);

-- ── 5. Timing manual override audit ──────────────────────────
CREATE TABLE IF NOT EXISTS public.stage_timing_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id     UUID NOT NULL REFERENCES public.order_stages(id) ON DELETE CASCADE,
  -- Hangi alan değiştirildi: active_work_seconds | machine_runtime_seconds |
  -- operator_setup_seconds | queue_waiting_seconds
  field_name   TEXT NOT NULL CHECK (field_name IN (
    'active_work_seconds',
    'machine_runtime_seconds',
    'operator_setup_seconds',
    'queue_waiting_seconds'
  )),
  old_value    INTEGER,
  new_value    INTEGER NOT NULL,
  reason       TEXT NOT NULL,                                   -- ZORUNLU
  actor_id     UUID NOT NULL REFERENCES public.profiles(id),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_timing_overrides_stage ON public.stage_timing_overrides (stage_id, occurred_at DESC);

-- ── 6. Confidence view ───────────────────────────────────────
CREATE OR REPLACE VIEW public.stage_timing_confidence AS
WITH event_stats AS (
  SELECT
    stage_id,
    COUNT(*)                                                        AS event_count,
    COUNT(*) FILTER (WHERE source IN ('system', 'machine_api'))     AS auto_event_count,
    COUNT(*) FILTER (WHERE source = 'manual')                       AS manual_event_count,
    MIN(occurred_at)                                                AS first_event_at,
    MAX(occurred_at)                                                AS last_event_at
  FROM public.stage_activity_events
  GROUP BY stage_id
)
SELECT
  s.id                                                AS stage_id,
  COALESCE(e.event_count, 0)                          AS event_count,
  COALESCE(e.auto_event_count, 0)                     AS auto_event_count,
  COALESCE(e.manual_event_count, 0)                   AS manual_event_count,
  e.first_event_at,
  e.last_event_at,
  -- 0-100 skor — daha çok otomatik event = daha güvenilir
  GREATEST(0, LEAST(100,
    CASE
      WHEN s.completed_at IS NULL AND s.first_activity_at IS NULL THEN 0
      WHEN COALESCE(e.event_count, 0) = 0                         THEN 30   -- sadece manuel buton
      WHEN COALESCE(e.auto_event_count, 0) > 5                    THEN 90 + LEAST(10, e.auto_event_count - 5)
      WHEN COALESCE(e.auto_event_count, 0) > 0                    THEN 60 + (e.auto_event_count * 5)
      ELSE 40
    END
  ))::INTEGER AS score,
  CASE
    WHEN s.completed_at IS NULL AND s.first_activity_at IS NULL THEN 'unknown'
    WHEN COALESCE(e.event_count, 0) = 0                         THEN 'low'
    WHEN COALESCE(e.auto_event_count, 0) > 5                    THEN 'high'
    WHEN COALESCE(e.auto_event_count, 0) > 0                    THEN 'medium'
    ELSE 'low'
  END AS confidence_level
FROM public.order_stages s
LEFT JOIN event_stats e ON e.stage_id = s.id;

COMMENT ON VIEW public.stage_timing_confidence IS
  'Stage timing güvenilirlik skoru — otomatik event sayısına göre 0-100. Düşükse manuel buton kayıtlı, yüksekse gerçek üretim aktivitesi izlenmiş demektir.';

-- ── 7. RLS — yeni tablolar order_stages RLS''i üzerinden filtrelenir ──
ALTER TABLE public.stage_activity_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_state_transitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_timing_overrides    ENABLE ROW LEVEL SECURITY;

-- SELECT — kullanıcı stage'i görüyorsa event'lerini de görür
DROP POLICY IF EXISTS "stage_activity_events_read" ON public.stage_activity_events;
CREATE POLICY "stage_activity_events_read"
  ON public.stage_activity_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.order_stages s WHERE s.id = stage_activity_events.stage_id));

DROP POLICY IF EXISTS "stage_state_transitions_read" ON public.stage_state_transitions;
CREATE POLICY "stage_state_transitions_read"
  ON public.stage_state_transitions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.order_stages s WHERE s.id = stage_state_transitions.stage_id));

DROP POLICY IF EXISTS "stage_timing_overrides_read" ON public.stage_timing_overrides;
CREATE POLICY "stage_timing_overrides_read"
  ON public.stage_timing_overrides FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.order_stages s WHERE s.id = stage_timing_overrides.stage_id));

-- INSERT/UPDATE/DELETE policy yok — sadece SECURITY DEFINER RPC'ler yazabilir (Phase B).

-- ── 8. Backfill — mevcut satırlar için started_at/completed_at varsa
--     active_work_seconds = (completed - started) yaklaşımı (eski veriler için)
UPDATE public.order_stages
SET active_work_seconds = GREATEST(0, EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER)
WHERE completed_at IS NOT NULL
  AND started_at   IS NOT NULL
  AND active_work_seconds = 0;

UPDATE public.order_stages
SET queue_waiting_seconds = GREATEST(0, EXTRACT(EPOCH FROM (started_at - assigned_at))::INTEGER)
WHERE started_at  IS NOT NULL
  AND assigned_at IS NOT NULL
  AND queue_waiting_seconds = 0;
