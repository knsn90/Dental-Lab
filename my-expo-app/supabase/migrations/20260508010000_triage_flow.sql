-- ============================================================
-- 20260508 — Triaj akışı: dinamik aşama planlama + atlama
--
-- ÖN GEREKLİ: 20260508005000_stage_status_skipped_enum.sql
-- ('skipped' enum değeri ayrı migration'da committed edilmiş olmalı —
-- Postgres aynı transaction içinde yeni enum değerini kullandırmaz).
--
-- Kapsam:
--   1. order_stages.skipped_reason kolonu (skipped iken zorunlu)
--   2. work_orders.triaged_at + triaged_by audit kolonları
--   3. case_type_stage_presets tablosu (sipariş tipine göre default)
--   4. triage_order(p_order_id, p_lines, p_first_tech_id) RPC
-- ============================================================

-- ── 1. order_stages.skipped_reason ────────────────────────
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS skipped_reason text;

ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz;

ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS skipped_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- skipped olan kayıtlarda reason zorunlu (CHECK)
ALTER TABLE public.order_stages
  DROP CONSTRAINT IF EXISTS order_stages_skipped_reason_check;

ALTER TABLE public.order_stages
  ADD CONSTRAINT order_stages_skipped_reason_check
    CHECK (status <> 'skipped' OR (skipped_reason IS NOT NULL AND length(trim(skipped_reason)) > 0));

-- ── 2. work_orders.triaged_at + triaged_by ────────────────
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS triaged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_triaged
  ON public.work_orders(triaged_at) WHERE triaged_at IS NOT NULL;

-- ── 3. case_type_stage_presets ────────────────────────────
-- Lab başına, sipariş tipine göre varsayılan aşama listesi.
-- Triaj modal'ında "Bu siparişe önerilen aşamalar" şeklinde otomatik seçilir.
CREATE TABLE IF NOT EXISTS public.case_type_stage_presets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,

  case_type       text NOT NULL,          -- 'zirconia_crown', 'temporary', 'bridge', 'denture', vb.
  case_type_label text NOT NULL,          -- "Zirkonyum kron", "Geçici", "Köprü"…
  station_ids     uuid[] NOT NULL,        -- lab_stations.id sıralı liste (sequence)

  is_default      boolean DEFAULT FALSE,  -- preset listesi yoksa "default" preset
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (lab_id, case_type)
);

CREATE INDEX IF NOT EXISTS idx_case_presets_lab
  ON public.case_type_stage_presets(lab_id);

ALTER TABLE public.case_type_stage_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_presets_read"  ON public.case_type_stage_presets;
DROP POLICY IF EXISTS "case_presets_write" ON public.case_type_stage_presets;

CREATE POLICY "case_presets_read"
  ON public.case_type_stage_presets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = case_type_stage_presets.lab_id OR p.user_type = 'admin')
    )
  );

CREATE POLICY "case_presets_write"
  ON public.case_type_stage_presets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin'
             OR (p.user_type = 'lab' AND p.role = 'manager' AND p.lab_id = case_type_stage_presets.lab_id))
    )
  );

CREATE OR REPLACE FUNCTION public.case_presets_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_presets_updated_at ON public.case_type_stage_presets;
CREATE TRIGGER trg_case_presets_updated_at
  BEFORE UPDATE ON public.case_type_stage_presets
  FOR EACH ROW EXECUTE FUNCTION public.case_presets_updated_at();

-- ── 4. triage_order RPC ───────────────────────────────────
-- Atomic: order_stages'leri yeniden yazar (mevcut bekleyenleri update eder),
-- atlanan stage'lere sebep yazar, ilk aktif stage'i atar, work_orders'ı işaretler.
--
-- p_lines: jsonb array — [
--   { station_id, sequence_order, status: 'aktif'|'bekliyor'|'skipped',
--     skipped_reason?, technician_id?, is_critical? }
-- ]
CREATE OR REPLACE FUNCTION public.triage_order(
  p_order_id        uuid,
  p_lines           jsonb,
  p_first_tech_id   uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_line          jsonb;
  v_lab_id        uuid;
  v_existing_id   uuid;
  v_stage_id      uuid;
  v_status        text;
  v_first_active  uuid;
BEGIN
  -- Lab id resolve (work_orders.lab_id veya profile)
  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  -- Daha önce triajlanmış mı? (B seçildi: tek seferlik)
  IF EXISTS (
    SELECT 1 FROM public.work_orders
    WHERE id = p_order_id AND triaged_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Order already triaged' USING ERRCODE = 'P0001';
  END IF;

  -- Her satır için stage upsert
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_status := v_line->>'status';

    -- Skipped + reason kontrolü
    IF v_status = 'skipped'
       AND (v_line->>'skipped_reason' IS NULL OR length(trim(v_line->>'skipped_reason')) = 0) THEN
      RAISE EXCEPTION 'Skipped stage requires reason';
    END IF;

    -- Mevcut stage var mı? (work_order_id + station_id)
    SELECT id INTO v_existing_id
    FROM public.order_stages
    WHERE work_order_id = p_order_id
      AND station_id = (v_line->>'station_id')::uuid
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Update mevcut kayıt
      UPDATE public.order_stages
      SET sequence_order  = (v_line->>'sequence_order')::int,
          status          = v_status::stage_status,
          technician_id   = NULLIF(v_line->>'technician_id', '')::uuid,
          is_critical     = COALESCE((v_line->>'is_critical')::boolean, FALSE),
          skipped_reason  = NULLIF(v_line->>'skipped_reason', ''),
          skipped_at      = CASE WHEN v_status = 'skipped' THEN NOW() ELSE NULL END,
          skipped_by      = CASE WHEN v_status = 'skipped' THEN auth.uid() ELSE NULL END,
          assigned_at     = CASE WHEN v_status = 'aktif' THEN COALESCE(assigned_at, NOW()) ELSE assigned_at END,
          started_at      = CASE WHEN v_status = 'aktif' THEN COALESCE(started_at, NOW()) ELSE started_at END
      WHERE id = v_existing_id
      RETURNING id INTO v_stage_id;
    ELSE
      -- Yeni stage insert
      INSERT INTO public.order_stages (
        work_order_id, station_id, technician_id, sequence_order,
        status, is_critical,
        skipped_reason, skipped_at, skipped_by,
        assigned_at, started_at
      ) VALUES (
        p_order_id,
        (v_line->>'station_id')::uuid,
        NULLIF(v_line->>'technician_id', '')::uuid,
        (v_line->>'sequence_order')::int,
        v_status::stage_status,
        COALESCE((v_line->>'is_critical')::boolean, FALSE),
        NULLIF(v_line->>'skipped_reason', ''),
        CASE WHEN v_status = 'skipped' THEN NOW() END,
        CASE WHEN v_status = 'skipped' THEN auth.uid() END,
        CASE WHEN v_status = 'aktif' THEN NOW() END,
        CASE WHEN v_status = 'aktif' THEN NOW() END
      )
      RETURNING id INTO v_stage_id;
    END IF;

    -- İlk aktif stage'i bul (sequence en küçük, status='aktif')
    IF v_status = 'aktif' AND v_first_active IS NULL THEN
      v_first_active := v_stage_id;
    END IF;
  END LOOP;

  -- Sipariş listede bulunmayan eski stage'leri pasifleştir (ihtiyaten skipped'a değil bekliyor'da bırak)
  -- Şu an bunu yapmıyoruz — sadece p_lines içindekiler güncellenir.

  -- work_orders güncelle
  UPDATE public.work_orders
  SET triaged_at = NOW(),
      triaged_by = auth.uid(),
      current_stage_id = v_first_active,
      status = CASE WHEN status = 'alindi' THEN 'uretimde' ELSE status END
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Triaj altyapısı hazır:
--   • stage_status enum 'skipped' eklendi
--   • order_stages: skipped_reason + skipped_at + skipped_by kolonları
--   • work_orders: triaged_at + triaged_by audit
--   • case_type_stage_presets: sipariş tipine göre preset
--   • triage_order() RPC: atomic plan + ilk stage atama + audit
-- ============================================================
