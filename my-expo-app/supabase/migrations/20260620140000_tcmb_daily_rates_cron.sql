-- "Anlık TCMB kuru" için günlük otomatik çekim.
-- Kural: dövizli işlemde manuel kur girilmezse o günün TCMB kuru baz alınır.
-- get_currency_rate() önce lab'a girilmiş manuel kuru, yoksa global (lab_id NULL,
-- source='tcmb') satırı döner. Bu satırların güncel kalması için tcmb-rates edge
-- fonksiyonu her iş günü TCMB yayını (~15:30 TR) sonrası otomatik çağrılır;
-- fonksiyon EUR/USD/GBP için bugünün global satırını yazar (sil+ekle).
--
-- NOT: pg_net + pg_cron gerektirir. tcmb-rates verify_jwt=false; anon key ile çağrılır.
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('tcmb-daily-rates')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tcmb-daily-rates');

SELECT cron.schedule(
  'tcmb-daily-rates',
  '30 13 * * 1-5',   -- iş günleri (Pzt-Cum) 13:30 UTC = 16:30 TR
  $$
  SELECT net.http_post(
    url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/tcmb-rates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU'
    ),
    body    := '{}'::jsonb
  );
  $$
);
