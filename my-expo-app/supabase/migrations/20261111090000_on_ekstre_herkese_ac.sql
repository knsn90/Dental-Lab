-- 20261111090000_on_ekstre_herkese_ac — ön ekstre onayı (invoice_approval_enabled) TÜM lab'larda açılır
-- (kullanıcı kararı 2026-11-11: "Hepsinde aç"). Ayar satırı olmayan lab'a varsayılanlı satır eklenir.
-- Geri alma: rollbacks/20261111090000_on_ekstre_herkese_ac.down.sql (önceki değerler before.txt'de).
BEGIN;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.lab_settings (lab_id)
  SELECT l.id FROM public.labs l
   WHERE NOT EXISTS (SELECT 1 FROM public.lab_settings s WHERE s.lab_id = l.id);
UPDATE public.lab_settings SET invoice_approval_enabled = true WHERE invoice_approval_enabled IS DISTINCT FROM true;
COMMIT;
