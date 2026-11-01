-- e-Fatura günlük durum taraması (2026-10-21, kullanıcı onaylı)
--
-- Her sabah 09:00 TR (06:00 UTC): son 30 günde gönderilmiş, hâlâ 'sent' olan e-faturalar
-- Luca'da sorgulanır (efatura-luca action 'status_sweep'). Durum değişirse aynı ETTN'li tüm
-- faturalar güncellenir; RED / HATA'da lab yöneticilerine uygulama içi bildirim + e-posta.
-- Yetki: paylaşılan sır (Vault 'notify_fn_secret' = edge NOTIFY_FN_SECRET), değer bu dosyada YOK.
-- Authorization/apikey = anon (yayınlanabilir) anahtar — yalnız ağ geçidini geçmek için.

select cron.unschedule('efatura-status-sweep')
 where exists (select 1 from cron.job where jobname = 'efatura-status-sweep');

select cron.schedule('efatura-status-sweep', '0 6 * * *', $cron$
  select net.http_post(
    url     := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/efatura-luca',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'Authorization',   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU',
      'apikey',          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU',
      'x-notify-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'notify_fn_secret' limit 1), '')
    ),
    body    := '{"action":"status_sweep"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
