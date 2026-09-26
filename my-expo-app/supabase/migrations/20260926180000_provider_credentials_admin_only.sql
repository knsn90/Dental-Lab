-- API anahtarlarını yalnız yetkili yönetici görsün.
--
-- SORUN: provider_credentials üzerindeki tek politika `lab_id = get_my_lab_id()`
-- idi; yani laba bağlı HER kullanıcı (teknisyen, kurye dahil) tabloyu
-- okuyabiliyordu. Arayüzde Entegrasyonlar sekmesi `manage_settings` istiyor
-- ama bu yalnız MENÜYÜ gizler: istemci Supabase'e kullanıcının kendi JWT'siyle
-- bağlandığı için `supabase.from('provider_credentials').select('*')` tek satır
-- sorgu anahtarları döndürüyordu. Canlıda teknisyen kimliğiyle doğrulandı
-- (2026-09-26): 1 satır + düz metin api_key okundu.
--
-- ÇÖZÜM: okuma/yazma `has_permission('manage_settings')` ile sınırlandı.
-- Rol sabitlemek yerine YETKİYE bağlamak bilinçli: lab admini dilerse
-- Yetkiler ekranından bunu lab yöneticisine de verebilir, karar onun.
--
-- EK KİLİT: teknisyen/kurye ve klinik tarafı rolleri, yetki yanlışlıkla
-- verilse bile DIŞARIDA bırakılır. API anahtarı sıradan bir ayar değil;
-- yanlış bir tıklama iyzico secret key'ini veya e-fatura şifresini sızdırır.
--
-- ETKİLENMEYENLER: payments-charge, payments-callback, efatura-send,
-- send-whatsapp-meta, banabikurye-* … hepsi service_role ile çalışır ve
-- RLS'i zaten baypas eder. Bu değişiklik onların hiçbirine dokunmaz.

DROP POLICY IF EXISTS provider_credentials_lab_all ON public.provider_credentials;

CREATE POLICY provider_credentials_settings_manage
  ON public.provider_credentials
  FOR ALL
  TO authenticated
  USING (
    lab_id = (SELECT get_my_lab_id())
    AND (SELECT has_permission('manage_settings'))
    AND (SELECT my_role_key()) NOT IN
        ('technician', 'courier', 'doctor', 'clinic_admin', 'clinic_secretary')
  )
  WITH CHECK (
    lab_id = (SELECT get_my_lab_id())
    AND (SELECT has_permission('manage_settings'))
    AND (SELECT my_role_key()) NOT IN
        ('technician', 'courier', 'doctor', 'clinic_admin', 'clinic_secretary')
  );

-- Platform yöneticisi (destek) ayrı ve AÇIKÇA tanımlı bir politikayla erişir;
-- lab politikasının içine gömülürse "neden görüyor?" sorusu izlenemez olur.
DROP POLICY IF EXISTS provider_credentials_platform_admin ON public.provider_credentials;

CREATE POLICY provider_credentials_platform_admin
  ON public.provider_credentials
  FOR ALL
  TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));

COMMENT ON TABLE public.provider_credentials IS
  'Lab başına entegratör kimlikleri (e-fatura, POS, kurye, mesajlaşma). Okuma/yazma manage_settings yetkisi ister; teknisyen/kurye rollerine kapalıdır. Edge function''lar service_role ile okur.';
