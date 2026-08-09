-- GÜVENLİK/KVKK: profiles cross-tenant PII sızıntısını kapat.
--
-- Sorun: iki fazla-geniş RLS SELECT politikası, HERHANGİ bir lab admini/müdürünün
-- TÜM lab'ların kullanıcı profillerini (isim, e-posta, telefon, TC kimlik no, adres)
-- görmesine izin veriyordu:
--   • admin_read_all_profiles   → is_admin_user()   (user_type='admin', lab-scope YOK)
--   • lab_manager_read_profiles → is_lab_manager()  (user_type='lab' & role='manager', lab-scope YOK)
--
-- Bu ikisi GEREKSİZ: "Lab users can read lab profiles" politikası
-- (is_lab_user() AND lab_id = get_my_lab_id()) zaten admin/müdür'ün KENDİ lab'ının
-- profillerini görmesini sağlıyor. Kaldırınca cross-tenant sızıntı kapanır, meşru
-- ekip erişimi korunur (impersonation ile doğrulandı: gerçek lab admini kendi 9
-- kişilik ekibini görmeye devam etti, diğer lab'lardan 0 profil).
--
-- NOT: clinic_admin_view_lab_users (klinik adminleri tüm lab/admin profillerini görür)
-- bilinçli bırakıldı — çoklu-lab klinik "lab keşfi" akışı için gerekli olabilir; ürün
-- kararı gerektirir, ayrı ele alınacak.

DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "lab_manager_read_profiles" ON public.profiles;
