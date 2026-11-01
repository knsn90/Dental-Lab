-- shipment_number_counters: RLS kapalıydı + giriş yapmış HER kullanıcı tam yetkili.
--
-- SORUN (Supabase güvenlik uyarısı rls_disabled_in_public, 2026-10-11): tablo
-- RLS'siz oluşturulmuş; Supabase'in varsayılan yetkileri yüzünden `authenticated`
-- rolü SELECT/INSERT/UPDATE/DELETE alıyordu. Herhangi bir labın — hatta bir
-- kliniğin — kullanıcısı tüm labların kargo sayacını okuyabilir, geri alabilir
-- ya da silebilirdi (aynı GND-YYYY-NNNN numarası tekrar üretilir / kurye
-- oluşturma hata verir). `anon` erişimi zaten yoktu.
--
-- NEDEN POLİTİKA YOK: tabloyu yalnız create_delivery (SECURITY DEFINER, sahibi
-- postgres, rolbypassrls) okur/yazar; istemci kodunda doğrudan erişim yok.
-- RLS açık + istemci rollerinin yetkisi kaldırılmış = istemciye tamamen kapalı.
-- FORCE RLS bilerek KULLANILMADI: sahibin (postgres) baypası create_delivery'nin
-- sayaç artırmasını korur.
--
-- DOĞRULAMA (geri sarılan test, 2026-10-13): düzeltme sonrası authenticated
-- okuma → insufficient_privilege; sahip rolüyle INSERT … ON CONFLICT artırma
-- çalıştı (2 → 3).

ALTER TABLE public.shipment_number_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.shipment_number_counters FROM anon, authenticated;

COMMENT ON TABLE public.shipment_number_counters IS
  'Lab+yıl başına kargo numarası sayacı (GND-YYYY-NNNN). Yalnız create_delivery (SECURITY DEFINER) erişir; istemciye kapalı (RLS açık, anon/authenticated yetkisi yok).';
