-- ═══════════════════════════════════════════════════════════════════════════
-- 029 — Personel Dosyası (Belge Yönetimi)
--   • employee_documents : Çalışan belgeleri (kimlik, sözleşme, sertifika…)
-- ═══════════════════════════════════════════════════════════════════════════

-- Supabase Storage bucket için (eğer yoksa oluştur)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-docs', 'employee-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: lab üyeleri kendi lab klasörlerine erişebilir
CREATE POLICY "employee_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-docs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM labs WHERE id = get_my_lab_id() LIMIT 1
    )
  );

CREATE POLICY "employee_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM labs WHERE id = get_my_lab_id() LIMIT 1
    )
  );

CREATE POLICY "employee_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM labs WHERE id = get_my_lab_id() LIMIT 1
    )
  );

-- ── Belge kayıtları tablosu ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID  NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  employee_id UUID  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Belge bilgisi
  doc_type    TEXT  NOT NULL CHECK (doc_type IN (
    'kimlik',         -- TC Kimlik / Nüfus
    'sozlesme',       -- İş Sözleşmesi
    'sertifika',      -- Sertifika / Diploma
    'sigorta',        -- SGK / Sigorta belgesi
    'saglik',         -- Sağlık raporu
    'izin_belgesi',   -- İzin onay belgesi
    'bordro',         -- Geçmiş bordro
    'diger'           -- Diğer
  )),

  title         TEXT NOT NULL,        -- Belge başlığı (örn. "TC Kimlik Ön Yüz")
  file_path     TEXT NOT NULL,        -- Supabase Storage path
  file_name     TEXT NOT NULL,        -- Orijinal dosya adı
  file_size     BIGINT,               -- Bytes
  mime_type     TEXT,                 -- image/jpeg, application/pdf vs.

  -- Geçerlilik tarihleri (opsiyonel)
  valid_from    DATE,
  valid_until   DATE,                 -- Dolmak üzere olan belgeler için uyarı

  notes         TEXT,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_docs_lab_own" ON employee_documents
  USING (lab_id = get_my_lab_id()) WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_emp_docs_employee
  ON employee_documents (employee_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_emp_docs_expiry
  ON employee_documents (lab_id, valid_until)
  WHERE valid_until IS NOT NULL;

-- ── View: yakında dolacak belgeler ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_expiring_documents AS
SELECT
  ed.id,
  ed.lab_id,
  ed.employee_id,
  e.full_name,
  e.role,
  ed.doc_type,
  ed.title,
  ed.valid_until,
  (ed.valid_until - CURRENT_DATE) AS days_until_expiry
FROM employee_documents ed
JOIN employees e ON e.id = ed.employee_id
WHERE ed.valid_until IS NOT NULL
  AND ed.valid_until >= CURRENT_DATE
  AND ed.valid_until <= CURRENT_DATE + INTERVAL '60 days'
ORDER BY ed.valid_until;
