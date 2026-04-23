-- ============================================================
-- 019 — Güvenlik Sıkılaştırma (Supabase Advisor bulgularını kapatır)
-- ============================================================
-- ERROR × 11:
--   rls_references_user_metadata × 10 (clinics, doctors, profiles üzerindeki
--     auth.jwt()->'user_metadata' kontrollü 10 eski politika — kullanıcı
--     kendi metadata'sını düzenleyebildiği için güvenlik açığı)
--   rls_disabled_in_public × 1 (warehouses tablosunda RLS kapalı)
--
-- WARN × 10:
--   function_search_path_mutable × 7 (7 fonksiyon mutable search_path ile;
--     hijacking riski — search_path'ı sabitleriz)
--   rls_policy_always_true × 3 (activity_logs + 2× profiles; WITH CHECK (true)
--     RLS'i bypass ediyordu)
--
-- BONUS TEMİZLİK: 012'den önce kalmış lab_id'siz eski politikalar da sökülür
-- (Lab all clinics, Lab manages clinics, lab_admin_clinics, doctor_view_clinics,
--  Lab all doctors, Lab manages doctors). Bunlar aynı erişimi 012'nin
-- "Lab users manage ..." politikaları zaten lab_id duyarlı olarak sağlıyor.
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. FUNCTION search_path hardening (7×)
--    Mevcut is_admin_user() ve is_lab_manager() zaten 'public' set etmiş,
--    aynı pattern'ı kalan 7 fonksiyona uygula.
-- ──────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_my_lab_id()         SET search_path TO 'public';
ALTER FUNCTION public.auto_set_lab_id()       SET search_path TO 'public';
ALTER FUNCTION public.is_lab_user()           SET search_path TO 'public';
ALTER FUNCTION public.handle_new_user()       SET search_path TO 'public';
ALTER FUNCTION public.handle_updated_at()     SET search_path TO 'public';
ALTER FUNCTION public.generate_order_number() SET search_path TO 'public';
ALTER FUNCTION public.update_work_order_status(uuid, work_order_status, uuid, text)
                                              SET search_path TO 'public';

-- ──────────────────────────────────────────────────────────────
-- 2. CLINICS — eski user_metadata JWT politikalarını ve lab_id'siz
--    politikaları sök. 012'nin "Lab users manage clinics" politikası kalır.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete clinics"   ON clinics;
DROP POLICY IF EXISTS "Admins can insert clinics"   ON clinics;
DROP POLICY IF EXISTS "Admins can update clinics"   ON clinics;
DROP POLICY IF EXISTS "Admins can view all clinics" ON clinics;
-- Lab_id'siz eski kopyalar (cross-tenant leak) — 012'deki duyarlı politika kalıyor
DROP POLICY IF EXISTS "Lab all clinics"     ON clinics;
DROP POLICY IF EXISTS "Lab manages clinics" ON clinics;
DROP POLICY IF EXISTS "lab_admin_clinics"   ON clinics;
DROP POLICY IF EXISTS "doctor_view_clinics" ON clinics;

-- Doktorlar kendi lab'larındaki klinikleri görebilsin (lab_id duyarlı)
DROP POLICY IF EXISTS "doctor_view_clinics_in_lab" ON clinics;
CREATE POLICY "doctor_view_clinics_in_lab"
  ON clinics FOR SELECT
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'doctor'
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 3. DOCTORS — aynı temizlik. "Lab users manage doctors" kalır.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete doctors"   ON doctors;
DROP POLICY IF EXISTS "Admins can insert doctors"   ON doctors;
DROP POLICY IF EXISTS "Admins can update doctors"   ON doctors;
DROP POLICY IF EXISTS "Admins can view all doctors" ON doctors;
DROP POLICY IF EXISTS "Lab all doctors"     ON doctors;
DROP POLICY IF EXISTS "Lab manages doctors" ON doctors;

-- ──────────────────────────────────────────────────────────────
-- 4. PROFILES — user_metadata JWT politikalarını sök.
--    is_admin_user()-tabanlı admin_* politikaları + Own profile readable/updatable
--    erişimi zaten sağlıyor.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all profiles"   ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- ──────────────────────────────────────────────────────────────
-- 5. rls_policy_always_true — WITH CHECK (true) olan 3 politikayı sıkılaştır
-- ──────────────────────────────────────────────────────────────

-- 5a. activity_logs.system_insert_logs
DROP POLICY IF EXISTS "system_insert_logs" ON activity_logs;
CREATE POLICY "authenticated_insert_logs"
  ON activity_logs FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND auth.uid() IS NOT NULL
  );
-- Not: lab_id auto_set_lab_id trigger'ı ile dolduruluyor (012'de eklendi).

-- 5b. profiles.admin_update_all_profiles
DROP POLICY IF EXISTS "admin_update_all_profiles" ON profiles;
CREATE POLICY "admin_update_all_profiles"
  ON profiles FOR UPDATE
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- 5c. profiles.lab_manager_update_doctor_approval
DROP POLICY IF EXISTS "lab_manager_update_doctor_approval" ON profiles;
CREATE POLICY "lab_manager_update_doctor_approval"
  ON profiles FOR UPDATE
  USING (is_lab_manager())
  WITH CHECK (is_lab_manager());

-- ──────────────────────────────────────────────────────────────
-- 6. WAREHOUSES — RLS enable + lab_id scope (rls_disabled_in_public ERROR)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);

-- Mevcut kayıtları default lab'a ata
UPDATE warehouses
   SET lab_id = '00000000-0000-0000-0000-000000000001'
   WHERE lab_id IS NULL;

-- RLS enable
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- INSERT sırasında lab_id otomatik gelsin
DROP TRIGGER IF EXISTS warehouses_auto_lab_id ON warehouses;
CREATE TRIGGER warehouses_auto_lab_id
  BEFORE INSERT ON warehouses
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

-- Lab kullanıcıları kendi lab'ının depolarını yönetir
DROP POLICY IF EXISTS "warehouses_lab" ON warehouses;
CREATE POLICY "warehouses_lab"
  ON warehouses FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_warehouses_lab_id ON warehouses(lab_id);

-- ──────────────────────────────────────────────────────────────
-- 7. STORAGE — avatars bucket geniş SELECT politikasını daralt
--    (public_bucket_allows_listing WARN)
--    Public URL erişimi RLS gerektirmediğinden avatarlar hâlâ görüntülenebilir;
--    sadece liste ve arbitrary okuma kısıtlanır.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
DROP POLICY IF EXISTS "Users can list their own avatar" ON storage.objects;
CREATE POLICY "Users can list their own avatar"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
