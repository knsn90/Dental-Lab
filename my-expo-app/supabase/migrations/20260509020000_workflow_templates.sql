-- ============================================================
-- 20260509 — Workflow Templates
--
-- Stage Library (lab_stations) üzerine "iş akışı şablonları" katmanı.
-- Her vaka tipinin tipik üretim rotası önceden tanımlanır → triajda
-- manager tek tıkla seçer.
--
-- Kapsam:
--   1. workflow_templates tablosu (lab başına şablon)
--   2. RLS (read: lab kullanıcıları + admin · write: manager + admin)
--   3. updated_at trigger
--   4. Default 8 şablon her lab için seed edilir:
--      Zirkon Kron, e.max Kron, Metal Seramik, Printed Temp,
--      İmplant Üstü, Total Protez, Cerrahi Guide, Veneer/Lamina
-- ============================================================

BEGIN;

-- ── 1. workflow_templates tablosu ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid REFERENCES public.labs(id) ON DELETE CASCADE,

  name            text NOT NULL,                    -- "Zirkon Kron", "Printed Temp"
  description     text,
  case_types      text[] DEFAULT '{}',              -- otomatik eşleşme: ['Zirkonyum Kron']
  category        text,                              -- 'crown_bridge', 'removable', vb.

  station_ids     uuid[] NOT NULL,                   -- sıralı liste
  is_default      boolean DEFAULT false,
  is_active       boolean DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (lab_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_lab
  ON public.workflow_templates(lab_id) WHERE is_active = true;

-- ── 2. RLS ─────────────────────────────────────────────────────
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wf_templates_read"  ON public.workflow_templates;
DROP POLICY IF EXISTS "wf_templates_write" ON public.workflow_templates;

CREATE POLICY "wf_templates_read"
  ON public.workflow_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.lab_id = workflow_templates.lab_id OR p.user_type = 'admin')
    )
  );

CREATE POLICY "wf_templates_write"
  ON public.workflow_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin'
             OR (p.user_type = 'lab' AND p.role = 'manager' AND p.lab_id = workflow_templates.lab_id))
    )
  );

-- ── 3. updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workflow_templates_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wf_templates_updated_at ON public.workflow_templates;
CREATE TRIGGER trg_wf_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.workflow_templates_updated_at();

-- ── 4. Default 8 şablon her lab için seed ──────────────────────
-- station_ids her lab'ın kendi istasyonlarına resolve edilir
INSERT INTO public.workflow_templates (lab_id, name, description, case_types, category, station_ids, is_default)
SELECT
  l.id,
  t.name, t.description, t.case_types, t.category,
  COALESCE(
    (SELECT array_agg(s.id ORDER BY s.sequence_hint)
     FROM unnest(t.station_names) AS sn
     JOIN public.lab_stations s ON s.name = sn AND s.lab_profile_id = l.id),
    ARRAY[]::uuid[]
  ),
  t.is_default
FROM public.labs l
CROSS JOIN (VALUES
  ('Zirkon Kron',
   'Klasik zirkon kron — milled + sintered',
   ARRAY['Zirkonyum Kron','Zirkonyum Köprü'],
   'crown_bridge',
   ARRAY['CAD Tasarım','CAM Hazırlık','Frezeleme','Sinterleme','Porselen & Make-up','Glaze','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('e.max Kron',
   'Pres seramik kron — milled + crystallization',
   ARRAY['Tam Seramik Kron (e.max)','Tam Seramik Köprü (e.max)'],
   'aesthetic',
   ARRAY['CAD Tasarım','CAM Hazırlık','Frezeleme','Sinterleme','Glaze','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('Metal Seramik',
   'Metal-porselen kron — döküm + porcelain',
   ARRAY['Metal Destekli Porselen Kron','Metal Destekli Porselen Köprü'],
   'crown_bridge',
   ARRAY['CAD Tasarım','CAM Hazırlık','Frezeleme','Metal Döküm','Porselen & Make-up','Glaze','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('Printed Temp',
   'Geçici kron — 3D print + cure',
   ARRAY['Geçici Kron (3D Baskı)','Geçici Köprü (3D Baskı)'],
   'temporary',
   ARRAY['CAD Tasarım','3D Baskı','Wash / Cure','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('İmplant Üstü',
   'İmplant abutment + kron',
   ARRAY['İmplant Üstü Kron (Zirkonyum)','İmplant Üstü Kron (Metal-Seramik)'],
   'implant',
   ARRAY['CAD Tasarım','CAM Hazırlık','Frezeleme','Sinterleme','İmplant Montajı','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('Total Protez',
   'Tam protez — print + finish',
   ARRAY['Tam Protez','Hareketli Bölümlü Protez'],
   'removable',
   ARRAY['Tarama','Model Hazırlık','CAD Tasarım','3D Baskı','Wash / Cure','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('Cerrahi Guide',
   'İmplant cerrahi şablonu',
   ARRAY['Cerrahi Şablon'],
   'surgical',
   ARRAY['CAD Tasarım','3D Baskı','Wash / Cure','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false),

  ('Veneer / Lamina',
   'Estetik veneer',
   ARRAY['Veneer','İnley / Onley'],
   'aesthetic',
   ARRAY['CAD Tasarım','CAM Hazırlık','Frezeleme','Glaze','Polisaj','Kalite Kontrol','Paketleme','Teslime Hazır'],
   false)
) AS t(name, description, case_types, category, station_names, is_default)
ON CONFLICT (lab_id, name) DO UPDATE SET
  description = EXCLUDED.description,
  case_types  = EXCLUDED.case_types,
  category    = EXCLUDED.category,
  station_ids = EXCLUDED.station_ids;

COMMIT;

-- ============================================================
-- ✓ Workflow templates hazır:
--   • workflow_templates tablosu + RLS + trigger
--   • 8 default şablon her lab için seed edilmiş
--   • Triaj modal'ında manager bu şablonlardan seçer
-- ============================================================
