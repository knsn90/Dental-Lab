-- ============================================================
-- Çoklu-Lab Klinik — Slice A (DB temeli)
-- Bir klinik/hekim TEK login ile BİRDEN ÇOK lab ile çalışabilsin.
-- Tamamen ADDITIVE: tek-lab (labs=1) kurulumunda davranış DEĞİŞMEZ
-- (backfill mevcut klinikler için 'active' membership yaratır; my_clinic_ids()
-- yalnız kanonik clinic_id döner). Ayrıca clinic_price_overrides klinik-okuma
-- RLS hatasını (user_type='clinic' hiç eşleşmiyordu) düzeltir.
--
-- Guard: lab/admin tek-lab yolu ve wo_lab_* + doctor_id=auth.uid() politikaları
-- DOKUNULMAZ. Yazımlar yalnız SECURITY DEFINER RPC'leri üzerinden.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLOLAR
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_lab_memberships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id            uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  member_clinic_id  uuid REFERENCES clinics(id)  ON DELETE CASCADE,   -- kanonik (profile.clinic_id) — çok-hekimli klinik
  member_profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,   -- solo hekim (auth.uid())
  lab_clinic_id     uuid REFERENCES clinics(id)  ON DELETE SET NULL,  -- o lab'ın özel CRM clinics satırı (lab_id-scoped)
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','rejected','revoked')),
  initiated_by      text NOT NULL CHECK (initiated_by IN ('lab','clinic')),
  requested_at      timestamptz DEFAULT now(),
  approved_at       timestamptz,
  approved_by       uuid REFERENCES profiles(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT member_present CHECK (member_clinic_id IS NOT NULL OR member_profile_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clm_lab_clinic  ON clinic_lab_memberships(lab_id, member_clinic_id)  WHERE member_clinic_id  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clm_lab_profile ON clinic_lab_memberships(lab_id, member_profile_id) WHERE member_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_clm_member_clinic  ON clinic_lab_memberships(member_clinic_id);
CREATE INDEX IF NOT EXISTS ix_clm_member_profile ON clinic_lab_memberships(member_profile_id);
CREATE INDEX IF NOT EXISTS ix_clm_lab_status     ON clinic_lab_memberships(lab_id, status);

DROP TRIGGER IF EXISTS clm_updated_at ON clinic_lab_memberships;
CREATE TRIGGER clm_updated_at BEFORE UPDATE ON clinic_lab_memberships
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Lab bağlanma kodları (iki yön: davet + public katılım)
CREATE TABLE IF NOT EXISTS lab_connect_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('invite','public_join')),
  max_uses    int,                                   -- NULL = sınırsız (public_join)
  uses        int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  created_by  uuid REFERENCES profiles(id),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_lcc_lab ON lab_connect_codes(lab_id);

ALTER TABLE labs ADD COLUMN IF NOT EXISTS clinic_auto_approve boolean NOT NULL DEFAULT false;

-- ──────────────────────────────────────────────────────────────
-- 2. RLS (yeni tablolar)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE clinic_lab_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_connect_codes      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clm_lab_all ON clinic_lab_memberships;
CREATE POLICY clm_lab_all ON clinic_lab_memberships FOR ALL
  USING      (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id())
  WITH CHECK (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS clm_clinic_select ON clinic_lab_memberships;
CREATE POLICY clm_clinic_select ON clinic_lab_memberships FOR SELECT
  USING (member_profile_id = auth.uid() OR member_clinic_id = my_clinic_id());

DROP POLICY IF EXISTS lcc_lab_all ON lab_connect_codes;
CREATE POLICY lcc_lab_all ON lab_connect_codes FOR ALL
  USING      (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id())
  WITH CHECK (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 3. GERİYE DÖNÜK BACKFILL (idempotent — NOT EXISTS ile)
-- ──────────────────────────────────────────────────────────────
-- Mevcut her lab-CRM clinics satırı için 'active' membership → tek-lab UX aynı kalır.
INSERT INTO clinic_lab_memberships (lab_id, member_clinic_id, lab_clinic_id, status, initiated_by, approved_at)
SELECT c.lab_id, c.id, c.id, 'active', 'lab', now()
FROM clinics c
WHERE c.lab_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clinic_lab_memberships m WHERE m.lab_id = c.lab_id AND m.member_clinic_id = c.id
  );

-- Klinik-satırı olmayan solo hekimler: sipariş verdikleri lab'lardan türet.
INSERT INTO clinic_lab_memberships (lab_id, member_profile_id, status, initiated_by, approved_at)
SELECT DISTINCT wo.lab_id, wo.doctor_id, 'active', 'lab', now()
FROM work_orders wo
JOIN profiles p ON p.id = wo.doctor_id
WHERE wo.lab_id IS NOT NULL
  AND p.user_type = 'doctor' AND p.clinic_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM clinic_lab_memberships m WHERE m.lab_id = wo.lab_id AND m.member_profile_id = wo.doctor_id
  );

-- ──────────────────────────────────────────────────────────────
-- 4. my_clinic_ids() — klinik-tarafı okuma çoklu-lab görsün
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_clinic_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM (
    SELECT (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AS clinic_id           -- kanonik
    UNION
    SELECT lab_clinic_id FROM clinic_lab_memberships
      WHERE status = 'active' AND lab_clinic_id IS NOT NULL
        AND (member_profile_id = auth.uid()
             OR member_clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  ) s WHERE clinic_id IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION my_clinic_ids() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. KLİNİK-TARAFI POLİTİKA GÜNCELLEMELERİ (yalnız additive; lab/doctor dokunulmaz)
-- ──────────────────────────────────────────────────────────────
-- invoices / invoice_items / payments — çoklu-lab okuma (eski = get_my_clinic_id() politikaları KALIR; bunlar OR'lu)
DROP POLICY IF EXISTS clinic_view_multilab_invoices ON public.invoices;
CREATE POLICY clinic_view_multilab_invoices ON public.invoices
  FOR SELECT USING (clinic_id IS NOT NULL AND clinic_id IN (SELECT my_clinic_ids()));

DROP POLICY IF EXISTS clinic_view_multilab_invoice_items ON public.invoice_items;
CREATE POLICY clinic_view_multilab_invoice_items ON public.invoice_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
      AND inv.clinic_id IS NOT NULL AND inv.clinic_id IN (SELECT my_clinic_ids())
  ));

DROP POLICY IF EXISTS clinic_view_multilab_payments ON public.payments;
CREATE POLICY clinic_view_multilab_payments ON public.payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = payments.invoice_id
      AND inv.clinic_id IS NOT NULL AND inv.clinic_id IN (SELECT my_clinic_ids())
  ));

-- clinic_price_overrides klinik-okuma: eski buggy politikayı ('clinic' hiç eşleşmez) düzelt
DROP POLICY IF EXISTS "Clinic users read own overrides" ON clinic_price_overrides;
DROP POLICY IF EXISTS clinic_read_overrides_multilab ON clinic_price_overrides;
CREATE POLICY clinic_read_overrides_multilab ON clinic_price_overrides
  FOR SELECT USING (clinic_id IN (SELECT my_clinic_ids()));

-- ──────────────────────────────────────────────────────────────
-- 6. BAĞLANMA RPC'LERİ (SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────
-- Kısa kod üreteci (karışması kolay 0/O/1/I hariç)
CREATE OR REPLACE FUNCTION _gen_connect_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random()*32)+1)::int, 1), '')
  FROM generate_series(1, 6);
$$;

-- Lab: tek-kullanımlık davet kodu
CREATE OR REPLACE FUNCTION lab_create_clinic_invite(p_target_clinic_id uuid DEFAULT NULL, p_expires_hours int DEFAULT 168)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lab uuid; v_code text; v_try int := 0;
BEGIN
  IF my_user_type() NOT IN ('lab','admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_lab := get_my_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'no lab context'; END IF;
  LOOP
    v_code := _gen_connect_code();
    BEGIN
      INSERT INTO lab_connect_codes (lab_id, code, kind, max_uses, expires_at, created_by)
      VALUES (v_lab, v_code, 'invite', 1, now() + make_interval(hours => GREATEST(p_expires_hours, 1)), auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1; IF v_try > 6 THEN RAISE; END IF;
    END;
  END LOOP;
END; $$;

-- Lab: kalıcı public katılım kodu (varsa döndür)
CREATE OR REPLACE FUNCTION lab_get_or_create_public_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lab uuid; v_code text; v_try int := 0;
BEGIN
  IF my_user_type() NOT IN ('lab','admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_lab := get_my_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'no lab context'; END IF;
  SELECT code INTO v_code FROM lab_connect_codes WHERE lab_id = v_lab AND kind = 'public_join' AND active LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    v_code := _gen_connect_code();
    BEGIN
      INSERT INTO lab_connect_codes (lab_id, code, kind, created_by) VALUES (v_lab, v_code, 'public_join', auth.uid());
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1; IF v_try > 6 THEN RAISE; END IF;
    END;
  END LOOP;
END; $$;

-- Klinik: kodla bağlan (ortak iç mantık)
CREATE OR REPLACE FUNCTION _clinic_connect(p_code text, p_expected_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ut  text := my_user_type();
  v_canonical uuid; v_name text; v_phone text; v_email text;
  v_code_id uuid; v_lab uuid; v_kind text; v_max int; v_uses int; v_exp timestamptz; v_active boolean;
  v_auto boolean; v_lab_clinic uuid; v_status text; v_member uuid;
BEGIN
  IF v_ut NOT IN ('doctor','clinic_admin','clinic_secretary') THEN RAISE EXCEPTION 'not a clinic user'; END IF;

  SELECT id, lab_id, kind, max_uses, uses, expires_at, active
    INTO v_code_id, v_lab, v_kind, v_max, v_uses, v_exp, v_active
    FROM lab_connect_codes WHERE upper(code) = upper(btrim(p_code));
  IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid code'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'code inactive'; END IF;
  IF v_kind <> p_expected_kind THEN RAISE EXCEPTION 'wrong code type'; END IF;
  IF v_exp IS NOT NULL AND v_exp < now() THEN RAISE EXCEPTION 'code expired'; END IF;
  IF v_max IS NOT NULL AND v_uses >= v_max THEN RAISE EXCEPTION 'code used up'; END IF;

  SELECT clinic_id, clinic_name, phone, email INTO v_canonical, v_name, v_phone, v_email
    FROM profiles WHERE id = v_uid;

  -- Zaten bağlıysa mevcut membership'i döndür (idempotent)
  SELECT id INTO v_member FROM clinic_lab_memberships
    WHERE lab_id = v_lab
      AND ((v_canonical IS NOT NULL AND member_clinic_id = v_canonical)
           OR (v_canonical IS NULL AND member_profile_id = v_uid))
    LIMIT 1;
  IF v_member IS NOT NULL THEN RETURN v_member; END IF;

  IF p_expected_kind = 'invite' THEN
    v_status := 'active';
  ELSE
    SELECT clinic_auto_approve INTO v_auto FROM labs WHERE id = v_lab;
    v_status := CASE WHEN COALESCE(v_auto, false) THEN 'active' ELSE 'pending' END;
  END IF;

  -- Lab'ın özel CRM clinics satırı (lab_id AÇIKÇA — klinik caller get_my_lab_id() NULL)
  INSERT INTO clinics (name, category, phone, email, lab_id, is_active)
  VALUES (COALESCE(NULLIF(btrim(v_name), ''), 'Klinik'), 'klinik', v_phone, v_email, v_lab, true)
  RETURNING id INTO v_lab_clinic;

  INSERT INTO clinic_lab_memberships
    (lab_id, member_clinic_id, member_profile_id, lab_clinic_id, status, initiated_by, approved_at)
  VALUES (v_lab, v_canonical,
          CASE WHEN v_canonical IS NULL THEN v_uid ELSE NULL END,
          v_lab_clinic, v_status,
          CASE WHEN p_expected_kind = 'invite' THEN 'lab' ELSE 'clinic' END,
          CASE WHEN v_status = 'active' THEN now() ELSE NULL END)
  RETURNING id INTO v_member;

  UPDATE lab_connect_codes SET uses = uses + 1 WHERE id = v_code_id;
  RETURN v_member;
END; $$;

CREATE OR REPLACE FUNCTION clinic_accept_invite(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN _clinic_connect(p_code, 'invite'); END; $$;

CREATE OR REPLACE FUNCTION clinic_request_lab(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN _clinic_connect(p_code, 'public_join'); END; $$;

CREATE OR REPLACE FUNCTION lab_approve_clinic(p_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF my_user_type() NOT IN ('lab','admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE clinic_lab_memberships
    SET status = 'active', approved_at = now(), approved_by = auth.uid()
    WHERE id = p_membership_id AND lab_id = get_my_lab_id() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not found / not your lab / not pending'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION lab_reject_clinic(p_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF my_user_type() NOT IN ('lab','admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE clinic_lab_memberships
    SET status = 'rejected', approved_by = auth.uid()
    WHERE id = p_membership_id AND lab_id = get_my_lab_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not found / not your lab'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION lab_set_auto_approve(p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF my_user_type() NOT IN ('lab','admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE labs SET clinic_auto_approve = COALESCE(p_on, false) WHERE id = get_my_lab_id();
END; $$;

-- Switcher beslemesi: caller'ın bağlı olduğu lab'lar (aktif + bekleyen)
CREATE OR REPLACE FUNCTION my_lab_memberships()
RETURNS TABLE(membership_id uuid, lab_id uuid, lab_name text, lab_logo text, status text, lab_clinic_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.lab_id, l.name, l.logo_url, m.status, m.lab_clinic_id
  FROM clinic_lab_memberships m JOIN labs l ON l.id = m.lab_id
  WHERE m.status IN ('active','pending')
    AND (m.member_profile_id = auth.uid()
         OR m.member_clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  ORDER BY (m.status = 'active') DESC, l.name;
$$;

GRANT EXECUTE ON FUNCTION lab_create_clinic_invite(uuid, int)  TO authenticated;
GRANT EXECUTE ON FUNCTION lab_get_or_create_public_code()      TO authenticated;
GRANT EXECUTE ON FUNCTION clinic_accept_invite(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION clinic_request_lab(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION lab_approve_clinic(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION lab_reject_clinic(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION lab_set_auto_approve(boolean)        TO authenticated;
GRANT EXECUTE ON FUNCTION my_lab_memberships()                 TO authenticated;
