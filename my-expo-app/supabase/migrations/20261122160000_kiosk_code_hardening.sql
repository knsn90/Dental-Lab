-- Tablet giriş kodu (kiosk) sertleştirme.
--
-- Sorunlar:
--   1) Tablette yalnız kod girilir; kiosk_resolve_user lab'daki İLK eşleşen kullanıcıyı
--      döndürür. İki kişi aynı kodu seçerse biri diğerinin hesabına girer.
--   2) Hız sınırı hiç çalışmıyor: yanlış denemede sayaç UPDATE edilip ardından
--      RAISE EXCEPTION atılıyor → istisna, sayaç güncellemesini de geri alıyor.
--      (Canlıda tüm failed_attempts = 0.) Cihaz kilidi de kişi kilidi de oluşmuyor.
--   3) Kod değiştirirken "mevcut kod" sınırsız denenebiliyor.
--   4) Kolay kodlar (000000, 123456…) kabul ediliyor.
--   5) staff_* işlevleri anon'a da açık.
--
-- Çözüm:
--   • Tablet önce kişiyi seçtirir (kiosk_list_users), kod yalnız O kişinin koduyla
--     karşılaştırılır (kiosk_resolve_user 3 argümanlı). Çakışma artık mümkün değil.
--   • İşlevler istisna atmak yerine jsonb SONUÇ döndürür → sayaç güncellemeleri kalıcı.
--     Cihaz: 8 yanlış → 10 dk kilit. Kişi: 5 yanlış → 15 dk kilit.
--   • staff_set_my_code: mevcut kod yanlışsa kişi sayacı artar (5 → 15 dk kilit),
--     kolay kodlar reddedilir, jsonb döndürür.
--   • anon/PUBLIC EXECUTE kaldırılır.
-- Eski 2 argümanlı kiosk_resolve_user kaldırılır (yalnız kiosk-login çağırıyordu;
-- edge fonksiyonunun yeni sürümü 3 argümanlıyı kullanır).

-- ── Kolay kod denetimi ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._kiosk_code_is_weak(p_code text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_code = repeat(left(p_code, 1), 6)            -- 000000, 111111 …
      OR position(p_code in '01234567890') > 0          -- 012345, 123456 … 567890
      OR position(p_code in '09876543210') > 0          -- 987654, 543210 …
      OR p_code = repeat(left(p_code, 2), 3)            -- 121212, 787878 …
      OR p_code = repeat(left(p_code, 3), 2);           -- 123123, 456456 …
$function$;

-- ── Tablette gösterilecek kişi listesi (yalnız service_role) ────────────────
CREATE OR REPLACE FUNCTION public.kiosk_list_users(p_device_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lab uuid; v_active boolean;
BEGIN
  SELECT d.lab_id, d.active INTO v_lab, v_active FROM public.lab_devices d WHERE d.id = p_device_id;
  IF v_lab IS NULL OR NOT coalesce(v_active, false) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.user_id, coalesce(nullif(trim(p.full_name), ''), '—')::text, p.avatar_url::text
      FROM public.staff_access_codes s
      JOIN public.profiles p ON p.id = s.user_id
     WHERE s.lab_id = v_lab AND s.active
       AND coalesce(p.is_active, true)
       AND (p.approval_status IS NULL OR p.approval_status = 'approved')
     ORDER BY lower(p.full_name);
END;
$function$;

-- ── Kod → kullanıcı (seçilen kişiye göre, kalıcı hız sınırı) ────────────────
DROP FUNCTION IF EXISTS public.kiosk_resolve_user(uuid, text);

CREATE OR REPLACE FUNCTION public.kiosk_resolve_user(p_device_id uuid, p_user_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_lab uuid; v_dev_active boolean; v_dev_locked timestamptz;
  v_hash text; v_code_active boolean; v_user_locked timestamptz; v_user_lab uuid;
  c_dev_max  int := 8;  c_dev_lock  interval := interval '10 minutes';
  c_user_max int := 5;  c_user_lock interval := interval '15 minutes';
BEGIN
  SELECT lab_id, active, locked_until INTO v_lab, v_dev_active, v_dev_locked
    FROM public.lab_devices WHERE id = p_device_id FOR UPDATE;
  IF v_lab IS NULL OR NOT coalesce(v_dev_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_invalid');
  END IF;
  IF v_dev_locked IS NOT NULL AND v_dev_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_locked');
  END IF;

  SELECT code_hash, active, locked_until, lab_id INTO v_hash, v_code_active, v_user_locked, v_user_lab
    FROM public.staff_access_codes WHERE user_id = p_user_id FOR UPDATE;

  IF v_user_locked IS NOT NULL AND v_user_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_locked');
  END IF;

  IF v_hash IS NOT NULL AND coalesce(v_code_active, false) AND v_user_lab = v_lab
     AND v_hash = crypt(p_code, v_hash) THEN
    UPDATE public.lab_devices SET failed_attempts = 0, locked_until = NULL, last_seen_at = now() WHERE id = p_device_id;
    UPDATE public.staff_access_codes SET failed_attempts = 0, locked_until = NULL WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
  END IF;

  -- Yanlış deneme: istisna ATMADAN sayaçları artır (kalıcı olsun).
  UPDATE public.lab_devices
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= c_dev_max THEN now() + c_dev_lock ELSE locked_until END,
         last_seen_at = now()
   WHERE id = p_device_id;
  IF v_hash IS NOT NULL AND v_user_lab = v_lab THEN
    UPDATE public.staff_access_codes
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= c_user_max THEN now() + c_user_lock ELSE locked_until END
     WHERE user_id = p_user_id;
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'no_match');
END;
$function$;

-- ── Kullanıcı kendi kodunu belirler ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.staff_set_my_code(text, text);

CREATE OR REPLACE FUNCTION public.staff_set_my_code(p_code text, p_old_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_lab uuid; v_hash text; v_active boolean; v_locked timestamptz;
  c_max int := 5; c_lock interval := interval '15 minutes';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT p.lab_id INTO v_lab FROM public.profiles p WHERE p.id = auth.uid();
  SELECT s.code_hash, s.active, s.locked_until INTO v_hash, v_active, v_locked
    FROM public.staff_access_codes s WHERE s.user_id = auth.uid() FOR UPDATE;

  IF v_hash IS NOT NULL AND coalesce(v_active, false) THEN
    IF v_locked IS NOT NULL AND v_locked > now() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_locked);
    END IF;
    IF p_old_code IS NULL OR p_old_code !~ '^[0-9]{6}$' OR crypt(p_old_code, v_hash) <> v_hash THEN
      UPDATE public.staff_access_codes
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= c_max THEN now() + c_lock ELSE locked_until END
       WHERE user_id = auth.uid();
      RETURN jsonb_build_object('ok', false, 'error', 'old_code_mismatch');
    END IF;
  END IF;

  IF public._kiosk_code_is_weak(p_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weak_code');
  END IF;

  INSERT INTO public.staff_access_codes(user_id, lab_id, code_hash, active, failed_attempts, locked_until, updated_at)
    VALUES (auth.uid(), v_lab, crypt(p_code, gen_salt('bf')), true, 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET code_hash = excluded.code_hash, lab_id = excluded.lab_id, active = true,
        failed_attempts = 0, locked_until = NULL, updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── Yetkiler ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._kiosk_code_is_weak(text)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kiosk_list_users(uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kiosk_resolve_user(uuid, uuid, text)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_list_users(uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.kiosk_resolve_user(uuid, uuid, text)    TO service_role;

REVOKE EXECUTE ON FUNCTION public.staff_set_my_code(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_clear_my_code()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_reset_code(uuid)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.staff_set_my_code(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_clear_my_code()         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.staff_reset_code(uuid)        TO authenticated;
