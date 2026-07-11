-- ============================================================
-- 20260512020000 — Modelaj istasyonunu ikiye böl
--
--   • "Model Hazırlık"  →  "Alçı Modelaj"        (Tarama'dan ÖNCE, seq=20)
--   • Yeni istasyon       "3D Yazıcı Modelaj"    (Tarama'dan SONRA, seq=35)
--
-- Mevcut order_stages kayıtları "Model Hazırlık" → "Alçı Modelaj" rename
-- ile otomatik geçer (aynı row, sadece name değişiyor).
-- ============================================================

BEGIN;

-- 1) Model Hazırlık → Alçı Modelaj (rename + reorder)
UPDATE public.lab_stations
   SET name          = 'Alçı Modelaj',
       sequence_hint = 20,
       icon          = 'tool'
 WHERE name = 'Model Hazırlık';

-- 2) Yeni istasyon: 3D Yazıcı Modelaj (Tarama'dan sonra, seq=35)
INSERT INTO public.lab_stations
  (lab_profile_id, name, color, icon, sequence_hint, is_critical, is_active, applicable_work_types)
SELECT l.id, '3D Yazıcı Modelaj', '#EC4899', 'printer', 35, false, true,
       ARRAY['crown_bridge','aesthetic','removable','implant']::text[]
  FROM public.labs l
ON CONFLICT (lab_profile_id, name) DO UPDATE SET
  is_active     = true,
  color         = EXCLUDED.color,
  icon          = EXCLUDED.icon,
  sequence_hint = EXCLUDED.sequence_hint,
  is_critical   = EXCLUDED.is_critical,
  applicable_work_types = EXCLUDED.applicable_work_types;

COMMIT;
