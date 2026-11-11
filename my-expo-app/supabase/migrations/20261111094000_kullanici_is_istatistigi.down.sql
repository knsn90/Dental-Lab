-- 20261111094000_kullanici_is_istatistigi geri alma: fonksiyon öncesinde yoktu → düşür.
BEGIN;
DROP FUNCTION IF EXISTS public.get_user_work_stats(uuid);
COMMIT;
