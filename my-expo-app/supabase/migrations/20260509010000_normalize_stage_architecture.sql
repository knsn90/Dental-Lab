-- ============================================================
-- 20260509 — Stage architecture normalizasyonu
--
-- Amaç:
--   • lab_stations tablosunu temizle ve standartlaştır
--   • Eski/duplicate istasyonları yeni'lere migrate et
--   • İş Alındı, Tesellüm, Modelaj, Frezeleme/Print, Sinterleme/Pişirim,
--     Bisküvi Prova, Tesviye/Bitim, Renklendirme, Glaze/Final,
--     Paketleme & Kargo, Tarama (3D Scan), Porselen / Makyaj kaldırılır
--   • Yerine 16 yeni standardize edilmiş istasyon eklenir
--
-- Yeni mimari:
--   PREPARATION:    Tarama, Model Hazırlık, CAD Tasarım
--   PRODUCTION:     CAM Hazırlık, Frezeleme, 3D Baskı, Metal Döküm
--   POST-PROCESS:   Wash/Cure, Sinterleme, Porselen & Make-up, Glaze,
--                   Polisaj, İmplant Montajı
--   FINALIZATION:   Kalite Kontrol, Paketleme, Teslime Hazır
-- ============================================================

BEGIN;

-- ── A) Yeni standardize edilmiş istasyonları ekle/güncelle ──────
INSERT INTO public.lab_stations
  (lab_profile_id, name, color, icon, sequence_hint, is_critical, is_active, applicable_work_types)
SELECT l.id, s.name, s.color, s.icon, s.sequence_hint, s.is_critical, true, s.applicable_work_types
FROM public.labs l
CROSS JOIN (VALUES
  ('Tarama',              '#06B6D4', 'scan',          30,  false, ARRAY[]::text[]),
  ('Model Hazırlık',      '#A78BFA', 'tool',          40,  false, ARRAY['crown_bridge','aesthetic','removable','implant']),
  ('CAD Tasarım',         '#3B82F6', 'cpu',           50,  true,  ARRAY[]::text[]),
  ('CAM Hazırlık',        '#8B5CF6', 'cpu',           60,  false, ARRAY['crown_bridge','aesthetic','implant']),
  ('Frezeleme',           '#F59E0B', 'cog',           70,  true,  ARRAY['crown_bridge','aesthetic','implant']),
  ('3D Baskı',            '#EC4899', 'printer',       80,  true,  ARRAY['removable','surgical','temporary']),
  ('Metal Döküm',         '#71717A', 'cog',           90,  false, ARRAY['crown_bridge']),
  ('Wash / Cure',         '#0EA5E9', 'shower',        100, false, ARRAY['removable','surgical','temporary']),
  ('Sinterleme',          '#EF4444', 'flame',         110, true,  ARRAY['crown_bridge','aesthetic']),
  ('Porselen & Make-up',  '#F97316', 'paintbrush',    120, false, ARRAY['crown_bridge','aesthetic']),
  ('Glaze',               '#DC2626', 'sparkles',      130, false, ARRAY['crown_bridge','aesthetic']),
  ('Polisaj',             '#10B981', 'shine',         140, false, ARRAY[]::text[]),
  ('İmplant Montajı',     '#0F172A', 'tool',          150, false, ARRAY['implant']),
  ('Kalite Kontrol',      '#0F172A', 'shield-check',  160, true,  ARRAY[]::text[]),
  ('Paketleme',           '#059669', 'box',           170, false, ARRAY[]::text[]),
  ('Teslime Hazır',       '#34D399', 'check-circle',  180, false, ARRAY[]::text[])
) AS s(name, color, icon, sequence_hint, is_critical, applicable_work_types)
ON CONFLICT (lab_profile_id, name) DO UPDATE SET
  is_active             = true,
  color                 = EXCLUDED.color,
  icon                  = EXCLUDED.icon,
  sequence_hint         = EXCLUDED.sequence_hint,
  is_critical           = EXCLUDED.is_critical,
  applicable_work_types = EXCLUDED.applicable_work_types;

-- ── B) Eski → yeni istasyon mapping ────────────────────────────
DO $$
DECLARE
  v_lab_id uuid;
  v_from   uuid;
  v_to     uuid;
BEGIN
  FOR v_lab_id IN SELECT DISTINCT lab_profile_id FROM public.lab_stations LOOP
    -- Modelaj → Model Hazırlık
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Modelaj';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Model Hazırlık';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Tarama (3D Scan) → Tarama
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Tarama (3D Scan)';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Tarama';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Frezeleme/Print → Frezeleme
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Frezeleme/Print';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Frezeleme';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Sinterleme/Pişirim → Sinterleme
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Sinterleme/Pişirim';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Sinterleme';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Porselen / Makyaj → Porselen & Make-up
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Porselen / Makyaj';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Porselen & Make-up';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Renklendirme → Porselen & Make-up (merge)
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Renklendirme';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Porselen & Make-up';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Glaze/Final → Glaze
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Glaze/Final';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Glaze';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;

    -- Paketleme & Kargo → Paketleme
    SELECT id INTO v_from FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Paketleme & Kargo';
    SELECT id INTO v_to   FROM public.lab_stations WHERE lab_profile_id=v_lab_id AND name='Paketleme';
    IF v_from IS NOT NULL AND v_to IS NOT NULL THEN
      DELETE FROM public.order_stages WHERE station_id=v_from
        AND work_order_id IN (SELECT work_order_id FROM public.order_stages WHERE station_id=v_to);
      UPDATE public.order_stages SET station_id=v_to WHERE station_id=v_from;
    END IF;
  END LOOP;
END $$;

-- ── C) Eski/silinmiş istasyonları temizle ──────────────────────
DELETE FROM public.order_stages WHERE station_id IN (
  SELECT id FROM public.lab_stations
  WHERE name IN (
    'Tesviye / Bitim', 'Bisküvi Prova', 'İş Alındı', 'Tesellüm',
    'Modelaj', 'Tarama (3D Scan)', 'Frezeleme/Print', 'Sinterleme/Pişirim',
    'Porselen / Makyaj', 'Renklendirme', 'Glaze/Final', 'Paketleme & Kargo'
  )
);

UPDATE public.case_type_stage_presets cs
SET station_ids = COALESCE(
  (
    SELECT array_agg(sid)
    FROM unnest(cs.station_ids) AS sid
    WHERE sid NOT IN (
      SELECT ls.id FROM public.lab_stations ls
      WHERE ls.name IN (
        'Tesviye / Bitim', 'Bisküvi Prova', 'İş Alındı', 'Tesellüm',
        'Modelaj', 'Tarama (3D Scan)', 'Frezeleme/Print', 'Sinterleme/Pişirim',
        'Porselen / Makyaj', 'Renklendirme', 'Glaze/Final', 'Paketleme & Kargo'
      )
    )
  ),
  ARRAY[]::uuid[]
);

DELETE FROM public.lab_stations WHERE name IN (
  'Tesviye / Bitim', 'Bisküvi Prova', 'İş Alındı', 'Tesellüm',
  'Modelaj', 'Tarama (3D Scan)', 'Frezeleme/Print', 'Sinterleme/Pişirim',
  'Porselen / Makyaj', 'Renklendirme', 'Glaze/Final', 'Paketleme & Kargo'
);

COMMIT;

-- ============================================================
-- ✓ 16 standardize istasyon, eski adlar tamamen kaldırıldı
-- ============================================================
