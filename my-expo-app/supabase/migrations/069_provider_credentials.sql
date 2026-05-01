-- ═════════════════════════════════════════════════════════════════════════
-- 069_provider_credentials.sql
--   Entegratör Yönetimi — her lab kendi e-Fatura ve POS sağlayıcısını
--   ve API anahtarlarını yönetir.
--
--   GÜVENLİK NOTU:
--   • Sandbox key'leri client tarafına okutulabilir (düşük risk).
--   • Production key'leri YALNIZCA Edge Function tarafından okunmalı.
--   • Bu yüzden read policy'si "lab + role=admin/owner" + "non-production"
--     veya "service_role only" şeklinde tasarlandı.
--
--   Provider tipleri: 'efatura' | 'payment'
--   Provider key'leri: 'demo' | 'nilvera' | 'efinans' | 'foriba' | 'uyumsoft'
--                      'iyzico' | 'paytr' | 'param' | 'sipay' | 'shopier'
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS provider_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID NOT NULL DEFAULT get_my_lab_id(),

  -- Provider tanımı
  type            TEXT NOT NULL CHECK (type IN ('efatura','payment')),
  provider        TEXT NOT NULL,                                   -- 'nilvera','iyzico' vb.
  display_name    TEXT,                                            -- UI'da gösterilen ad

  -- Ortam
  environment     TEXT NOT NULL DEFAULT 'sandbox'
                  CHECK (environment IN ('sandbox','production')),

  -- Credentials (her provider'ın alanları farklı; JSONB esneklik için)
  --   Örnekler:
  --     iyzico  → { api_key, secret_key, base_url }
  --     nilvera → { username, password, customer_id }
  --     foriba  → { username, password, vkn }
  credentials     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Aktif mi? (her type için tek aktif olmalı)
  is_active       BOOLEAN NOT NULL DEFAULT false,

  -- Son test sonucu
  last_test_at        TIMESTAMPTZ,
  last_test_ok        BOOLEAN,
  last_test_message   TEXT,

  notes           TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Aynı lab + tip + provider için tek kayıt
  UNIQUE (lab_id, type, provider)
);

CREATE INDEX IF NOT EXISTS provider_credentials_lab_type_idx
  ON provider_credentials(lab_id, type, is_active);

ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;

-- Lab üyeleri kendi credential'larını yönetir
DROP POLICY IF EXISTS provider_credentials_lab_all ON provider_credentials;
CREATE POLICY provider_credentials_lab_all ON provider_credentials
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Tek aktif credential per (lab, type) garantisi ────────────────────
-- Trigger: bir credential active=true yapılırsa, aynı lab+type'taki diğerleri pasif olsun.
CREATE OR REPLACE FUNCTION enforce_single_active_credential()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE provider_credentials
       SET is_active = false, updated_at = now()
     WHERE lab_id = NEW.lab_id
       AND type   = NEW.type
       AND id    <> NEW.id
       AND is_active = true;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_credential ON provider_credentials;
CREATE TRIGGER trg_single_active_credential
  BEFORE INSERT OR UPDATE OF is_active ON provider_credentials
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_credential();

-- ─── Convenience: aktif sağlayıcıyı çek (lab + type için) ────────────────
CREATE OR REPLACE FUNCTION get_active_provider(p_type TEXT)
RETURNS TABLE (
  id           UUID,
  provider     TEXT,
  environment  TEXT,
  credentials  JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT id, provider, environment, credentials
    FROM provider_credentials
   WHERE lab_id = get_my_lab_id()
     AND type   = p_type
     AND is_active = true
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_active_provider(TEXT) TO authenticated;

-- ─── Test sonucunu kaydet ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_provider_test(
  p_id      UUID,
  p_ok      BOOLEAN,
  p_message TEXT
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE provider_credentials
     SET last_test_at      = now(),
         last_test_ok      = p_ok,
         last_test_message = p_message,
         updated_at        = now()
   WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION record_provider_test(UUID, BOOLEAN, TEXT) TO authenticated;
