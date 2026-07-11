-- ============================================================
-- 20260628140000 — handle_new_user: auth.users.email → profiles.email kopyala
--
-- Sorun: handle_new_user yeni profili oluştururken email kolonunu DOLDURMUYORDU.
-- Sonuç: her yeni kullanıcının profiles.email'i NULL kalıyor → send-email-notification
-- edge function'ı profiles.email'i okuduğu için bu kullanıcılara HİÇ email gitmiyor
-- (no_targets). Mevcut null'lar auth.users'tan elle backfill edildi; bu trigger
-- güncellemesi bundan sonraki kayıtlarda da email'i otomatik taşır.
--
-- Değişiklik: INSERT'e `email` kolonu + `NEW.email` değeri eklendi. Gerisi aynen.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id UUID;
  v_role      TEXT;
BEGIN
  BEGIN
    v_clinic_id := NULLIF(NEW.raw_user_meta_data->>'clinic_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_clinic_id := NULL;
  END;

  -- Sadece izin verilen lab role'lerini tut, diğerlerini NULL'a düşür
  v_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  IF v_role NOT IN ('manager','technician','accounting','courier','service','receptionist','intern') THEN
    v_role := NULL;
  END IF;

  INSERT INTO profiles (
    id, user_type, full_name, clinic_name, clinic_id,
    role, phone, is_active, approval_status, lab_id, email
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'doctor'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'clinic_name',
    v_clinic_id,
    v_role,
    NEW.raw_user_meta_data->>'phone',
    COALESCE((NEW.raw_user_meta_data->>'is_active')::BOOLEAN, TRUE),
    COALESCE(NEW.raw_user_meta_data->>'approval_status', 'pending'),
    NULLIF(NEW.raw_user_meta_data->>'lab_id', '')::UUID,
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
