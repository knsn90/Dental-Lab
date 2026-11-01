-- profiles.language → HESAP DİLİ
--
-- İstemci artık bu sütunu yazar ve girişte okur (core/i18n/accountLanguage.ts):
-- dil yalnız cihazda tutulduğu için yeni cihaz / PWA / başka alan adında
-- uygulama cihaz diline (çoğu zaman İngilizce) düşüyordu.
--
-- Bugüne kadar uygulama bu sütunu HİÇ yazmadı ve okumadı (sunucu tarafında da
-- kullanan fonksiyon yok); tüm satırlar 070'teki varsayılan 'tr' — kimsenin
-- seçimi değil. NULL = "kullanıcı henüz dil seçmedi" olsun diye varsayılan
-- kaldırılır ve mevcut değerler boşaltılır; yoksa girişte herkes Türkçe'ye
-- zorlanırdı (Farsça kullanan İran labları dahil).
--
-- updated_at tetikleyicisi bu tek seferlik temizlikte kapatılır: değer
-- değişikliği kullanıcı işlemi değil, "son güncelleme" sıralamalarını bozmasın.
-- trg_log_profile_updated dil değişimini zaten kaydetmez; yetki korumaları
-- (profiles_guard_privileged_columns, _guard_clinic_user_update) postgres'i baypas eder.

begin;

alter table public.profiles alter column language drop default;

alter table public.profiles disable trigger profiles_updated_at;
update public.profiles set language = null where language is not null;
alter table public.profiles enable trigger profiles_updated_at;

alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check
  check (language is null or language in ('tr', 'en', 'de', 'fa'));

comment on column public.profiles.language is
  'Hesap dili (tr/en/de/fa). NULL = kullanıcı henüz seçmedi. İstemci: core/i18n/accountLanguage.ts';

commit;
