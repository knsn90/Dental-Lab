-- ═══════════════════════════════════════════════════════════════════════
--  Payment Submissions — Klinik tarafından bildirilen ödemeler
--
--  Klinik kullanıcısı havale/EFT/kart/nakit bilgisini girer (dekont no,
--  banka, gönderen, tarih, tutar). Kayıt 'pending' statüsünde durur.
--  Lab admin onayladığında payments tablosuna gerçek bir ödeme satırı
--  eklenir ve submission 'approved' olarak işaretlenir.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_submissions (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id                UUID            NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id             UUID            REFERENCES doctors(id) ON DELETE SET NULL,
  invoice_id            UUID            REFERENCES invoices(id) ON DELETE SET NULL,

  amount                NUMERIC(12,2)   NOT NULL CHECK (amount > 0),
  currency              TEXT            NOT NULL DEFAULT 'TRY',
  payment_method        TEXT            NOT NULL
                        CHECK (payment_method IN ('havale','eft','kart','nakit','cek','diger')),
  payment_date          DATE            NOT NULL DEFAULT CURRENT_DATE,

  -- Havale/EFT bilgileri
  reference_no          TEXT,           -- Dekont / fiş no
  bank_name             TEXT,           -- Banka adı
  sender_name           TEXT,           -- Gönderen isim/şirket
  receipt_url           TEXT,           -- Dekont fotoğrafı (storage URL)

  notes                 TEXT,

  status                TEXT            NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),

  -- İz bilgileri
  submitted_by          UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  reviewed_by           UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  reject_reason         TEXT,

  -- Onay sonrası oluşan ödeme kaydı
  approved_payment_id   UUID            REFERENCES payments(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_lab     ON payment_submissions (lab_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_clinic  ON payment_submissions (clinic_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_invoice ON payment_submissions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status  ON payment_submissions (status);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_date    ON payment_submissions (payment_date DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_payment_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_submissions_touch ON payment_submissions;
CREATE TRIGGER trg_payment_submissions_touch
  BEFORE UPDATE ON payment_submissions
  FOR EACH ROW EXECUTE FUNCTION touch_payment_submissions_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  RLS
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE payment_submissions ENABLE ROW LEVEL SECURITY;

-- ── SELECT ─────────────────────────────────────────────────────────────
-- Lab üyeleri kendi lab'larının tüm submission'larını görebilir
DROP POLICY IF EXISTS payment_submissions_lab_select ON payment_submissions;
CREATE POLICY payment_submissions_lab_select ON payment_submissions
  FOR SELECT USING (lab_id = get_my_lab_id());

-- Klinik admin kendi kliniğinin submission'larını görebilir
DROP POLICY IF EXISTS payment_submissions_clinic_admin_select ON payment_submissions;
CREATE POLICY payment_submissions_clinic_admin_select ON payment_submissions
  FOR SELECT USING (
    is_clinic_admin()
    AND clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Klinik sekreter kendi kliniğinin submission'larını görebilir
DROP POLICY IF EXISTS payment_submissions_clinic_secretary_select ON payment_submissions;
CREATE POLICY payment_submissions_clinic_secretary_select ON payment_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'clinic_secretary'
        AND p.clinic_id = payment_submissions.clinic_id
    )
  );

-- Hekim kendi kliniğinin submission'larını görebilir
-- (profiles.user_type='doctor' + profiles.clinic_id eşleşmesi üzerinden)
DROP POLICY IF EXISTS payment_submissions_doctor_select ON payment_submissions;
CREATE POLICY payment_submissions_doctor_select ON payment_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'doctor'
        AND p.clinic_id = payment_submissions.clinic_id
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────
-- Klinik admin: kendi kliniği için ödeme bildirebilir
DROP POLICY IF EXISTS payment_submissions_clinic_admin_insert ON payment_submissions;
CREATE POLICY payment_submissions_clinic_admin_insert ON payment_submissions
  FOR INSERT WITH CHECK (
    is_clinic_admin()
    AND clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Klinik sekreter
DROP POLICY IF EXISTS payment_submissions_clinic_secretary_insert ON payment_submissions;
CREATE POLICY payment_submissions_clinic_secretary_insert ON payment_submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'clinic_secretary'
        AND p.clinic_id = payment_submissions.clinic_id
    )
  );

-- Hekim: kendi kliniğine ödeme bildirebilir
DROP POLICY IF EXISTS payment_submissions_doctor_insert ON payment_submissions;
CREATE POLICY payment_submissions_doctor_insert ON payment_submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'doctor'
        AND p.clinic_id = payment_submissions.clinic_id
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────
-- Sadece lab üyeleri (admin / manager) onay/red yapabilir.
-- Approve/reject akışı zaten RPC üzerinden yürütülecek.
DROP POLICY IF EXISTS payment_submissions_lab_update ON payment_submissions;
CREATE POLICY payment_submissions_lab_update ON payment_submissions
  FOR UPDATE USING (lab_id = get_my_lab_id())
  WITH CHECK   (lab_id = get_my_lab_id());

-- Submitter kendi bekleyen submission'ını iptal edebilir
DROP POLICY IF EXISTS payment_submissions_self_cancel ON payment_submissions;
CREATE POLICY payment_submissions_self_cancel ON payment_submissions
  FOR UPDATE USING (
    submitted_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND status IN ('pending','cancelled')
  );

-- ═══════════════════════════════════════════════════════════════════════
--  RPC'ler
-- ═══════════════════════════════════════════════════════════════════════

-- Klinik kullanıcısı ödeme bildirir
CREATE OR REPLACE FUNCTION submit_payment(
  p_clinic_id       UUID,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_date    DATE,
  p_invoice_id      UUID DEFAULT NULL,
  p_doctor_id       UUID DEFAULT NULL,
  p_reference_no    TEXT DEFAULT NULL,
  p_bank_name       TEXT DEFAULT NULL,
  p_sender_name     TEXT DEFAULT NULL,
  p_receipt_url     TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_lab_id   UUID;
  v_id       UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- lab_id'yi klinikten al
  SELECT lab_id INTO v_lab_id FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Klinik bulunamadı veya lab_id eksik.';
  END IF;

  -- Yetki kontrolü: clinic_admin / clinic_secretary aynı klinikten
  -- veya doktor aynı klinikten
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_user_id
      AND p.clinic_id = p_clinic_id
      AND p.user_type IN ('clinic_admin','clinic_secretary')
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_user_id
      AND p.user_type = 'doctor'
      AND p.clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Bu klinik için ödeme bildirme yetkiniz yok.';
  END IF;

  -- Tutar/yöntem kontrolleri
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Geçersiz tutar.';
  END IF;
  IF p_payment_method NOT IN ('havale','eft','kart','nakit','cek','diger') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi.';
  END IF;
  IF p_payment_method IN ('havale','eft') AND (p_reference_no IS NULL OR LENGTH(BTRIM(p_reference_no)) = 0) THEN
    RAISE EXCEPTION 'Havale/EFT için dekont/referans no zorunlu.';
  END IF;

  INSERT INTO payment_submissions (
    lab_id, clinic_id, doctor_id, invoice_id,
    amount, payment_method, payment_date,
    reference_no, bank_name, sender_name, receipt_url, notes,
    status, submitted_by
  ) VALUES (
    v_lab_id, p_clinic_id, p_doctor_id, p_invoice_id,
    p_amount, p_payment_method, p_payment_date,
    NULLIF(BTRIM(p_reference_no), ''),
    NULLIF(BTRIM(p_bank_name), ''),
    NULLIF(BTRIM(p_sender_name), ''),
    NULLIF(BTRIM(p_receipt_url), ''),
    NULLIF(BTRIM(p_notes), ''),
    'pending', v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_payment(
  UUID, NUMERIC, TEXT, DATE, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Admin onaylar — payments tablosuna gerçek kayıt düşer
CREATE OR REPLACE FUNCTION approve_payment_submission(p_submission_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_type  TEXT;
  v_role       TEXT;
  v_sub        payment_submissions%ROWTYPE;
  v_payment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
    RAISE EXCEPTION 'Onaylama yetkiniz yok.';
  END IF;

  SELECT * INTO v_sub FROM payment_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödeme bildirimi bulunamadı.';
  END IF;
  IF v_sub.lab_id IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Farklı bir laboratuvarın bildirimini onaylayamazsınız.';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Bildirim zaten işlenmiş (durum: %).', v_sub.status;
  END IF;

  -- payments tablosuna kayıt düşer (invoice_id varsa)
  -- invoice_id zorunlu olduğu için yoksa hata fırlatıyoruz —
  -- ileride "genel hesap ödemesi" eklenirse buraya genişletilebilir.
  IF v_sub.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Fatura bağlanmamış bildirim — şu an manuel müdahale gerekiyor.';
  END IF;

  INSERT INTO payments (
    lab_id, invoice_id, amount, payment_date, payment_method, reference_no, notes, received_by
  ) VALUES (
    v_sub.lab_id, v_sub.invoice_id, v_sub.amount, v_sub.payment_date,
    -- payments tablosu CHECK'i havale/nakit/kart/cek/diger kabul ediyor; eft → havale eşle
    CASE WHEN v_sub.payment_method = 'eft' THEN 'havale' ELSE v_sub.payment_method END,
    COALESCE(v_sub.reference_no, ''),
    CONCAT_WS(' · ',
      CASE WHEN v_sub.payment_method = 'eft' THEN '[EFT]' END,
      CASE WHEN v_sub.bank_name   IS NOT NULL THEN 'Banka: ' || v_sub.bank_name   END,
      CASE WHEN v_sub.sender_name IS NOT NULL THEN 'Gönderen: ' || v_sub.sender_name END,
      v_sub.notes
    ),
    v_user_id
  )
  RETURNING id INTO v_payment_id;

  -- Submission'ı onayla
  UPDATE payment_submissions
     SET status = 'approved',
         reviewed_by = v_user_id,
         reviewed_at = NOW(),
         approved_payment_id = v_payment_id
   WHERE id = p_submission_id;

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_payment_submission(UUID) TO authenticated;

-- Admin reddeder
CREATE OR REPLACE FUNCTION reject_payment_submission(p_submission_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_type  TEXT;
  v_role       TEXT;
  v_sub        payment_submissions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
    RAISE EXCEPTION 'Onaylama yetkiniz yok.';
  END IF;

  SELECT * INTO v_sub FROM payment_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödeme bildirimi bulunamadı.';
  END IF;
  IF v_sub.lab_id IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Farklı bir laboratuvarın bildirimini reddedemezsiniz.';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Bildirim zaten işlenmiş (durum: %).', v_sub.status;
  END IF;

  UPDATE payment_submissions
     SET status = 'rejected',
         reviewed_by = v_user_id,
         reviewed_at = NOW(),
         reject_reason = NULLIF(BTRIM(p_reason), '')
   WHERE id = p_submission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_payment_submission(UUID, TEXT) TO authenticated;

COMMENT ON TABLE payment_submissions IS
  'Klinik tarafından bildirilen ve admin onayı bekleyen ödemeler. Onay sonrası payments tablosuna kayıt düşer.';
