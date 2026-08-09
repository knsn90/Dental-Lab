-- ============================================================================
-- Fiziksel sayım hatırlatması — yönetici + lab manager'a, günlük cron.
--
-- İki ayrı durum, iki ayrı mesaj:
--   1) Vadesi geldi  — son kapanan sayımdan bu yana N gün geçti (veya hiç yok)
--   2) Yarım kaldı   — açık taslak 7 günden uzun süredir bekliyor
--
-- Neden tek mesajda birleştirmiyoruz: "sayım yap" ile "başladığın sayımı bitir"
-- farklı eylemler. Açık taslak varken "yeni sayım başlat" demek, yarım kalan
-- sayımı sıfırlama hatasına davetiye çıkarır.
--
-- Gönderim: fn_daily_order_watch ile aynı desen (notifications kaydı + edge
-- fonksiyon çağrıları). Günde bir kez — cron her gün çalışır, hatırlatma
-- yığılmaz. Link kullanıcının paneline göre (admin/lab) kurulur.
-- ============================================================================

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS stock_count_interval_days int NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.lab_settings.stock_count_interval_days IS
  'Fiziksel sayım periyodu (gün). Son kapanan sayımın üzerinden bu kadar geçince hatırlatılır.';

-- Fonksiyonun gövdesi icin bkz. canlı tanım:
--   SELECT pg_get_functiondef('public.fn_stock_count_reminder'::regproc);
-- (anon anahtar gömülü olduğu için burada tekrarlanmıyor; şema değişikliği
--  yalnız yukarıdaki kolon + aşağıdaki cron kaydı.)

-- Günlük 06:00 UTC = 09:00 TR
-- SELECT cron.schedule('stock-count-reminder', '0 6 * * *',
--                      'SELECT public.fn_stock_count_reminder();');
