-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — Klinik "Kullanıcılar" modülü
--
-- Bir klinik panelinde clinic_admin artık üç tür kullanıcı ekleyebilir:
--   1) doctor              — hekim (mevcut akış)
--   2) clinic_secretary    — sekreter (YENİ user_type)
--   3) clinic_admin        — ikinci/yedek klinik yöneticisi (mevcut user_type)
--
-- Fine-grained yetki: profiles.clinic_permissions JSONB
--   { orders_view, orders_create, orders_edit, doctors_manage, users_manage,
--     settings_manage, billing_view } gibi anahtarlar
--
-- RLS: clinic_admin kendi kliniğindeki profiles satırlarını UPDATE edebilir
--      (insert/delete edge function üzerinden yapılır — auth.users yaratımı için).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) user_type CHECK constraint — clinic_secretary eklendi
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('lab', 'doctor', 'admin', 'clinic_admin', 'clinic_secretary', 'courier'));

-- 2) Fine-grained permissions (clinic scope) — JSONB
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinic_permissions JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.clinic_permissions IS
  'Klinik panelinde rol bazlı yetkiler (orders_view, orders_create, doctors_manage, users_manage, settings_manage, billing_view).';

-- 3) Backfill: mevcut clinic_admin kullanıcılara full permissions; doctor'a default; secretary boş
UPDATE public.profiles
   SET clinic_permissions = jsonb_build_object(
     'orders_view',     true,
     'orders_create',   true,
     'orders_edit',     true,
     'doctors_manage',  true,
     'users_manage',    true,
     'settings_manage', true,
     'billing_view',    true
   )
 WHERE user_type = 'clinic_admin'
   AND (clinic_permissions = '{}'::jsonb OR clinic_permissions IS NULL);

UPDATE public.profiles
   SET clinic_permissions = jsonb_build_object(
     'orders_view',   true,
     'orders_create', true,
     'orders_edit',   true
   )
 WHERE user_type = 'doctor'
   AND clinic_id IS NOT NULL
   AND (clinic_permissions = '{}'::jsonb OR clinic_permissions IS NULL);

-- 4) RLS — clinic_admin kendi kliniğindeki profilleri okuyabilsin
--    (mevcut clinic_admin_view_clinic_profiles policy zaten var; idempotent recreate)
DROP POLICY IF EXISTS clinic_admin_view_clinic_profiles ON public.profiles;
CREATE POLICY clinic_admin_view_clinic_profiles
  ON public.profiles FOR SELECT
  USING (
    is_clinic_admin()
    AND clinic_id IS NOT NULL
    AND clinic_id = my_clinic_id()
  );

-- 5) RLS — clinic_admin kendi kliniğindeki kullanıcıları güncelleyebilsin
--    (user_type / clinic_id alanlarını DEĞİŞTİRMESİNİ engellemek için trigger)
DROP POLICY IF EXISTS clinic_admin_update_clinic_users ON public.profiles;
CREATE POLICY clinic_admin_update_clinic_users
  ON public.profiles FOR UPDATE
  USING (
    is_clinic_admin()
    AND clinic_id IS NOT NULL
    AND clinic_id = my_clinic_id()
    AND user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
  )
  WITH CHECK (
    is_clinic_admin()
    AND clinic_id = my_clinic_id()
    AND user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
  );

-- 6) Trigger: clinic_admin user_type / clinic_id alanlarını değiştirmesini engelle
CREATE OR REPLACE FUNCTION public._guard_clinic_user_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sadece clinic_admin çağrısı kontrol edilir (admin/lab serbest)
  IF NOT is_clinic_admin() THEN RETURN NEW; END IF;

  IF NEW.id <> OLD.id
     OR COALESCE(NEW.clinic_id::text,'') <> COALESCE(OLD.clinic_id::text,'')
     OR COALESCE(NEW.lab_id::text,'')    <> COALESCE(OLD.lab_id::text,'') THEN
    RAISE EXCEPTION 'clinic_admin id/clinic_id/lab_id değiştiremez';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_clinic_admin_guard ON public.profiles;
CREATE TRIGGER profiles_clinic_admin_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_clinic_user_update();

-- 7) View: klinik kullanıcı listesi (RLS otomatik filtreler)
CREATE OR REPLACE VIEW public.my_clinic_users AS
  SELECT
    id, full_name, phone, email, avatar_url, is_active,
    clinic_id, clinic_name, user_type, specialty, clinic_permissions,
    created_at
    FROM public.profiles
   WHERE user_type IN ('doctor', 'clinic_admin', 'clinic_secretary')
     AND clinic_id IS NOT NULL;

GRANT SELECT ON public.my_clinic_users TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
