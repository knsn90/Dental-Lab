-- ═════════════════════════════════════════════════════════════════════════
-- 067_efatura_foundation.sql
--   e-Fatura / e-Arşiv Foundation (provider-agnostic)
--
--   Eklenenler:
--     • clinics.vkn, clinics.tax_office, clinics.efatura_registered (cache)
--     • doctors.tckn  (kişi bazlı e-Arşiv için)
--     • labs zaten tax_number'a sahip — VKN olarak kullanılır
--     • invoices.efatura_uuid, efatura_etag, efatura_status, efatura_type
--     • efatura_logs — gönderim geçmişi (provider, request/response, error)
--     • mukellef_cache — GİB sorgu cache (24h TTL)
--
--   NOTE: Belirli bir entegratöre bağlı değil. Provider seçildiğinde
--         efatura_logs.provider alanı kayıt eder, yeni adapter eklenebilir.
-- ═════════════════════════════════════════════════════════════════════════

-- ─── Mükellef bilgileri (clinics + doctors) ─────────────────────────────
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS vkn                 TEXT,
  ADD COLUMN IF NOT EXISTS tax_office          TEXT,
  ADD COLUMN IF NOT EXISTS efatura_registered  BOOLEAN,                 -- null=bilinmiyor, t=mükellef, f=mükellef değil
  ADD COLUMN IF NOT EXISTS efatura_alias       TEXT,                    -- GİB alias (urn:mail:...)
  ADD COLUMN IF NOT EXISTS efatura_checked_at  TIMESTAMPTZ;

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS tckn                TEXT;

-- VKN/TCKN format sanity check (uzunluk)
ALTER TABLE clinics DROP CONSTRAINT IF EXISTS clinics_vkn_format;
ALTER TABLE clinics
  ADD CONSTRAINT clinics_vkn_format CHECK (vkn IS NULL OR length(vkn) IN (10, 11));

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_tckn_format;
ALTER TABLE doctors
  ADD CONSTRAINT doctors_tckn_format CHECK (tckn IS NULL OR length(tckn) = 11);

-- ─── Invoices üzerine e-fatura izleme alanları ──────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS efatura_uuid       UUID,                    -- entegratör tarafından üretilen UUID
  ADD COLUMN IF NOT EXISTS efatura_etag       TEXT,                    -- versiyon takibi
  ADD COLUMN IF NOT EXISTS efatura_type       TEXT
    CHECK (efatura_type IN ('e_fatura','e_arsiv') OR efatura_type IS NULL),
  ADD COLUMN IF NOT EXISTS efatura_status     TEXT DEFAULT 'pending'
    CHECK (efatura_status IN ('pending','queued','sent','accepted','rejected','cancelled','error')),
  ADD COLUMN IF NOT EXISTS efatura_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS efatura_error      TEXT,
  ADD COLUMN IF NOT EXISTS efatura_provider   TEXT;                    -- 'nilvera', 'efinans', 'demo' vb.

CREATE INDEX IF NOT EXISTS invoices_efatura_status_idx ON invoices(lab_id, efatura_status);

-- ─── efatura_logs — her gönderimin kaydı ────────────────────────────────
CREATE TABLE IF NOT EXISTS efatura_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID NOT NULL DEFAULT get_my_lab_id(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('send','query','cancel','status_check')),
  request_body    JSONB,
  response_body   JSONB,
  http_status     INT,
  efatura_uuid    UUID,
  efatura_status  TEXT,
  error_code      TEXT,
  error_message   TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efatura_logs_invoice_idx ON efatura_logs(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS efatura_logs_lab_idx     ON efatura_logs(lab_id, created_at DESC);

ALTER TABLE efatura_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efatura_logs_lab_all ON efatura_logs;
CREATE POLICY efatura_logs_lab_all ON efatura_logs
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Mükellef sorgu cache (24h TTL) ─────────────────────────────────────
-- GİB'e VKN sorgusu yapılır → "kayıtlı mı?" sonucu cache'lenir.
-- 24 saat sonra otomatik refresh.
CREATE TABLE IF NOT EXISTS mukellef_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vkn             TEXT NOT NULL UNIQUE,
  is_registered   BOOLEAN NOT NULL,
  alias           TEXT,                                              -- urn:mail:...
  title           TEXT,                                              -- Şirket ünvanı
  tax_office      TEXT,
  provider        TEXT,                                              -- sorgulayan entegratör
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mukellef_cache_checked_at_idx ON mukellef_cache(checked_at);

-- Mükellef cache global okunur (lab izolasyonu yok — paylaşımlı bilgi)
ALTER TABLE mukellef_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mukellef_cache_read_all ON mukellef_cache;
CREATE POLICY mukellef_cache_read_all ON mukellef_cache
  FOR SELECT USING (true);

DROP POLICY IF EXISTS mukellef_cache_write_authenticated ON mukellef_cache;
CREATE POLICY mukellef_cache_write_authenticated ON mukellef_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS mukellef_cache_update_authenticated ON mukellef_cache;
CREATE POLICY mukellef_cache_update_authenticated ON mukellef_cache
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Yardımcı RPC: VKN/TCKN'den efatura_type karar verici ────────────────
CREATE OR REPLACE FUNCTION decide_efatura_type(
  p_vkn       TEXT,
  p_tckn      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_registered BOOLEAN;
BEGIN
  -- Mükellef cache'inde kayıtlı VKN varsa → e_fatura
  IF p_vkn IS NOT NULL THEN
    SELECT is_registered INTO v_registered
      FROM mukellef_cache WHERE vkn = p_vkn LIMIT 1;
    IF v_registered IS TRUE THEN
      RETURN 'e_fatura';
    END IF;
  END IF;

  -- Aksi halde e-Arşiv (mükellef değil veya bireysel)
  RETURN 'e_arsiv';
END;
$$;

GRANT EXECUTE ON FUNCTION decide_efatura_type(TEXT, TEXT) TO authenticated;
