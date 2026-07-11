-- ============================================================
-- P1 — Sunucu-tarafı, atomik lab (kiracı) oluşturma RPC'si
--
-- Önceki akış: kurulum sihirbazı client'ta labs INSERT + profiles
-- UPDATE'i AYRI yapıyordu → yarıda kalırsa yetim kayıt; owner_id/lab_id
-- client kontrolünde (spoof edilebilir).
--
-- Bu RPC tek transaction'da:
--   1) çağıranın yetkisini doğrular (lab manager / admin, lab_id IS NULL),
--   2) labs satırını owner_id = auth.uid() ile SUNUCU tarafında oluşturur,
--   3) çağıranın profiles.lab_id'sini yeni lab'a bağlar,
--   4) yeni lab_id'yi döndürür.
-- SECURITY DEFINER → RLS'i güvenli şekilde aşar; client owner_id/lab_id
-- gönderemez. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION create_lab_tenant(
  p_name    text,
  p_phone   text DEFAULT NULL,
  p_email   text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_type  text;
  v_role  text;
  v_lab   uuid;
  v_base  text;
  v_slug  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'lab name required' USING errcode = '22023';
  END IF;

  SELECT user_type::text, role, lab_id
    INTO v_type, v_role, v_lab
    FROM profiles WHERE id = v_uid;

  -- Yalnız lab yöneticisi / admin yeni lab oluşturabilir
  IF NOT (v_type = 'admin' OR (v_type = 'lab' AND v_role = 'manager')) THEN
    RAISE EXCEPTION 'not authorized to create a lab' USING errcode = '42501';
  END IF;

  -- Zaten bir lab'a bağlıysa tekrar oluşturamaz
  IF v_lab IS NOT NULL THEN
    RAISE EXCEPTION 'account already belongs to a lab' USING errcode = '23505';
  END IF;

  -- slug: ad -> kebab + kısa benzersiz sonek (çakışmada yenile)
  v_base := btrim(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base = '' THEN v_base := 'lab'; END IF;
  LOOP
    v_slug := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM labs WHERE slug = v_slug);
  END LOOP;

  INSERT INTO labs (name, slug, owner_id, phone, email, address)
  VALUES (btrim(p_name), v_slug, v_uid, p_phone, p_email, p_address)
  RETURNING id INTO v_lab;

  UPDATE profiles SET lab_id = v_lab WHERE id = v_uid;

  RETURN v_lab;
END;
$$;

REVOKE ALL ON FUNCTION create_lab_tenant(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lab_tenant(text, text, text, text) TO authenticated;

-- ============================================================
-- END — P1 create_lab_tenant RPC
-- ============================================================
