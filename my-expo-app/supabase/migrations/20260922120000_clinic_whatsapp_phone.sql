-- 20260922120000_clinic_whatsapp_phone.sql
--
-- Kurum (clinics) WhatsApp numarası + WhatsApp gönderim tekilleştirmesi.
--
-- 1) clinics.whatsapp_phone — kurumun ortak WhatsApp hattı. Kullanıcı kararı
--    (2026-09-22): "kurum öncelikli, kişisel korunur" → kurum kullanıcılarına
--    giden WhatsApp önce BURAYA gider; hekim profilinde kendi whatsapp_phone'u
--    doluysa o kişi kendi numarasından almaya devam eder. Kapatma: kullanıcının
--    kendi notification_prefs'i (değişmedi).
--
-- 2) whatsapp_notifications.dedup_key + kısmi UNIQUE index — aynı olay aynı
--    numaraya BİR kez gider. Tetikleyici (trg_whatsapp_meta_notify) her bildirim
--    satırı için AYRI çağrı yaptığı için bir kurumun 3 kullanıcısı aynı kurum
--    hattına 3 mesaj düşürürdü. Kontrol-sonra-gönder paralel çağrılarda yarışa
--    açık; send-whatsapp-meta önce bu anahtarla 'pending' satır EKLEYEREK hattı
--    sahiplenir, çakışan çağrı 23505 alıp atlar.
--
-- Yalnız EKLEME: mevcut veri/davranış değişmez (dedup_key eski satırlarda NULL,
-- index yalnız NULL olmayanları kapsar).

alter table public.clinics
  add column if not exists whatsapp_phone text;

alter table public.whatsapp_notifications
  add column if not exists dedup_key text;

create unique index if not exists whatsapp_notifications_dedup_key_uq
  on public.whatsapp_notifications (dedup_key)
  where dedup_key is not null;
