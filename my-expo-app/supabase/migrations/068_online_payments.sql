-- ═════════════════════════════════════════════════════════════════════════
-- 068_online_payments.sql
--   Online POS / Ödeme Linki altyapısı (provider-agnostic)
--
--   Akış:
--     1) Lab kullanıcısı bir fatura için "Ödeme Linki Oluştur" → unique token
--     2) Hekime link gönderilir (in-app/SMS/email)
--     3) Hekim /pay/[token] sayfasını açar → 3DS akışı başlatılır
--     4) Provider callback'i ödemeyi onaylar
--     5) invoice.paid_amount güncellenir, payments tablosuna kayıt düşer
--
--   Provider'lar: 'demo' | 'iyzico' | 'paytr' | 'param' | 'sipay' (sonradan)
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_intents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id            UUID NOT NULL DEFAULT get_my_lab_id(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  clinic_id         UUID REFERENCES clinics(id) ON DELETE SET NULL,
  doctor_id         UUID REFERENCES doctors(id) ON DELETE SET NULL,

  -- Halka açık link için kısa token (auth gerekmez)
  public_token      TEXT NOT NULL UNIQUE,

  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'TRY',
  installments      INT NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 12),

  -- Komisyon (provider tarafından kesilir, snapshot)
  commission_rate   NUMERIC(5,3),
  commission_amount NUMERIC(12,2),

  -- Provider bilgileri
  provider          TEXT NOT NULL DEFAULT 'demo',
  provider_ref      TEXT,                                          -- Provider tarafındaki conversationId/paymentId
  provider_token    TEXT,                                          -- 3DS sayfasına yönlendirme için

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','awaiting_3ds','authorized','paid','failed','expired','cancelled','refunded','partially_refunded')),

  error_code        TEXT,
  error_message     TEXT,

  -- Zaman damgaları
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  paid_at           TIMESTAMPTZ,
  refunded_at       TIMESTAMPTZ,

  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_intents_invoice_idx     ON payment_intents(invoice_id);
CREATE INDEX IF NOT EXISTS payment_intents_lab_status_idx  ON payment_intents(lab_id, status);
CREATE INDEX IF NOT EXISTS payment_intents_token_idx       ON payment_intents(public_token);
CREATE INDEX IF NOT EXISTS payment_intents_expires_idx     ON payment_intents(expires_at) WHERE status IN ('pending','awaiting_3ds');

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

-- Lab üyeleri kendi intent'lerini görür
DROP POLICY IF EXISTS payment_intents_lab_all ON payment_intents;
CREATE POLICY payment_intents_lab_all ON payment_intents
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- Halka açık ödeme sayfası için: token üzerinden anonim okuma
-- (sadece status='pending'|'awaiting_3ds' ve süresi geçmemiş intent'ler)
DROP POLICY IF EXISTS payment_intents_public_token_read ON payment_intents;
CREATE POLICY payment_intents_public_token_read ON payment_intents
  FOR SELECT
  USING (
    status IN ('pending','awaiting_3ds','authorized','paid')
    AND expires_at > now()
  );

-- ─── payment_attempts — her 3DS denemesinin log'u ───────────────────────
CREATE TABLE IF NOT EXISTS payment_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id       UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('init','3ds_redirect','callback','query','refund','cancel')),
  request_body    JSONB,
  response_body   JSONB,
  http_status     INT,
  error_code      TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_attempts_intent_idx ON payment_attempts(intent_id, created_at DESC);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attempts_via_intent ON payment_attempts;
CREATE POLICY payment_attempts_via_intent ON payment_attempts
  FOR ALL
  USING (intent_id IN (SELECT id FROM payment_intents WHERE lab_id = get_my_lab_id()))
  WITH CHECK (intent_id IN (SELECT id FROM payment_intents WHERE lab_id = get_my_lab_id()));

-- ─── Token üretici (URL-safe, 22 karakter base32) ───────────────────────
CREATE OR REPLACE FUNCTION generate_payment_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
  v_chars TEXT := 'abcdefghijklmnopqrstuvwxyz234567';
  v_i     INT;
  v_byte  INT;
BEGIN
  v_token := '';
  FOR v_i IN 1..22 LOOP
    v_byte := floor(random() * 32)::INT;
    v_token := v_token || substring(v_chars FROM (v_byte + 1) FOR 1);
  END LOOP;
  RETURN v_token;
END;
$$;

-- ─── Public payment intent fetch (anonim okuma için yardımcı) ───────────
-- Anonim kullanıcı sadece intent'in tutarını ve fatura no'sunu görmeli;
-- doktor/klinik adı, lab logosu vb. minimum bilgi.
CREATE OR REPLACE FUNCTION fetch_public_payment_intent(p_token TEXT)
RETURNS TABLE (
  intent_id        UUID,
  amount           NUMERIC,
  currency         TEXT,
  installments     INT,
  status           TEXT,
  expires_at       TIMESTAMPTZ,
  invoice_number   TEXT,
  invoice_due_date DATE,
  clinic_name      TEXT,
  doctor_name      TEXT,
  lab_name         TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pi.id,
    pi.amount,
    pi.currency,
    pi.installments,
    pi.status,
    pi.expires_at,
    i.invoice_number,
    i.due_date,
    c.name AS clinic_name,
    d.full_name AS doctor_name,
    l.name AS lab_name
  FROM payment_intents pi
  JOIN invoices i ON i.id = pi.invoice_id
  LEFT JOIN clinics c ON c.id = pi.clinic_id
  LEFT JOIN doctors d ON d.id = pi.doctor_id
  JOIN labs l ON l.id = pi.lab_id
  WHERE pi.public_token = p_token
    AND pi.expires_at > now()
    AND pi.status IN ('pending','awaiting_3ds','authorized','paid');
$$;

GRANT EXECUTE ON FUNCTION fetch_public_payment_intent(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_payment_token() TO authenticated;

-- ─── Ödeme onaylandığında invoice'a yansıt (RPC) ────────────────────────
-- Provider callback'i bu RPC'yi çağırır.
-- Idempotent: aynı intent_id için ikinci çağrıda no-op.
CREATE OR REPLACE FUNCTION confirm_payment_intent(
  p_intent_id   UUID,
  p_provider_ref TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intent     RECORD;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent bulunamadı: %', p_intent_id;
  END IF;

  IF v_intent.status = 'paid' THEN
    -- Idempotent: zaten ödenmiş
    RETURN v_intent.id;
  END IF;

  -- 1) Intent durumunu güncelle
  UPDATE payment_intents
     SET status       = 'paid',
         paid_at      = now(),
         provider_ref = COALESCE(p_provider_ref, provider_ref),
         updated_at   = now()
   WHERE id = p_intent_id;

  -- 2) payments tablosuna kayıt ekle (mevcut sistemle entegre)
  INSERT INTO payments (
    lab_id, invoice_id, amount, payment_method, payment_date, notes
  ) VALUES (
    v_intent.lab_id, v_intent.invoice_id, v_intent.amount,
    'kart',                                                 -- mevcut enum değeri
    CURRENT_DATE,
    'Online ödeme · ' || v_intent.provider || COALESCE(' · ref:' || p_provider_ref, '')
  )
  RETURNING id INTO v_payment_id;

  -- 3) invoice.paid_amount + status güncelle
  UPDATE invoices
     SET paid_amount = paid_amount + v_intent.amount,
         status = CASE
                    WHEN paid_amount + v_intent.amount >= total THEN 'odendi'
                    ELSE 'kismi_odendi'
                  END,
         updated_at = now()
   WHERE id = v_intent.invoice_id;

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_payment_intent(UUID, TEXT) TO authenticated;
