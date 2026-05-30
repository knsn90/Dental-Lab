-- ============================================================
-- Migration: Webhook Events Idempotency Table
--
-- Sorun: Aynı ödeme callback'i provider tarafından birden fazla
-- gönderilebilir (retry, ağ hatası). Tekrar işleme → çifte ödeme onayı.
--
-- Çözüm: (provider_ref, provider) çifti için unique constraint.
-- Edge Function insert dener; çakışma → zaten işlendi → 200 döner.
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref TEXT        NOT NULL,
  provider     TEXT        NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_ref, provider)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_ref
  ON webhook_events(provider_ref, provider);

-- RLS — sadece service role yazabilir
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Eski kayıtları temizlemek için (opsiyonel, pg_cron ile çalıştır)
-- DELETE FROM webhook_events WHERE received_at < NOW() - INTERVAL '30 days';
