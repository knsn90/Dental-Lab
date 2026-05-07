-- ═══════════════════════════════════════════════════════════════════
-- Migration: clinic_type + clinic_invitations
-- Tarih: 2026-05-03
-- Açıklama: Klinik türü (muayenehane/klinik/poliklinik) ve hekim davet sistemi
-- ═══════════════════════════════════════════════════════════════════

-- 1. clinics tablosuna clinic_type kolonu ekle
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS clinic_type TEXT DEFAULT 'muayenehane'
  CHECK (clinic_type IN ('muayenehane', 'klinik', 'poliklinik', 'hastane'));

COMMENT ON COLUMN clinics.clinic_type IS 'muayenehane = tek hekim, klinik/poliklinik = çok hekimli';

-- 2. clinic_invitations tablosu — hekim davet sistemi
CREATE TABLE IF NOT EXISTS clinic_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,                          -- opsiyonel: davet edilen kişinin adı
  invited_by  UUID REFERENCES auth.users(id),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  token       TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_clinic_invitations_clinic ON clinic_invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_invitations_email ON clinic_invitations(email);
CREATE INDEX IF NOT EXISTS idx_clinic_invitations_token ON clinic_invitations(token);

-- RLS
ALTER TABLE clinic_invitations ENABLE ROW LEVEL SECURITY;

-- Klinik yöneticisi kendi kliniğinin davetlerini görebilir
CREATE POLICY "clinic_admin_read_invitations" ON clinic_invitations
  FOR SELECT USING (
    clinic_id IN (
      SELECT c.id FROM clinics c
      JOIN doctors d ON d.clinic_id = c.id
      JOIN profiles p ON p.id = auth.uid()
      WHERE p.user_type = 'doctor'
    )
  );

-- Klinik yöneticisi davet oluşturabilir
CREATE POLICY "clinic_admin_create_invitations" ON clinic_invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
  );

-- Klinik yöneticisi davet iptal edebilir
CREATE POLICY "clinic_admin_update_invitations" ON clinic_invitations
  FOR UPDATE USING (
    invited_by = auth.uid()
  );

-- Lab yöneticisi tüm davetleri görebilir
CREATE POLICY "lab_admin_read_invitations" ON clinic_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'lab'
    )
  );
