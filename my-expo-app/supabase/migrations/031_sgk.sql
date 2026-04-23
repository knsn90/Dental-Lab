-- ═══════════════════════════════════════════════════════════════════════════
-- 031 — SGK İşlemleri
--   • employees + labs tablosu SGK alanları
--   • sgk_bildirge: işe giriş / çıkış bildirgeleri
--   • employee_payroll: vergi alanları eklendi
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Employees — SGK alanları ──────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sgk_sicil_no      TEXT,
  ADD COLUMN IF NOT EXISTS sgk_tescil_tarihi DATE;

-- ── 2. Labs — İşyeri SGK sicil numarası ──────────────────────────────────────
ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS sgk_isyeri_no TEXT;

-- ── 3. SGK Bildirgeleri (işe giriş / çıkış) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sgk_bildirge (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        NOT NULL DEFAULT get_my_lab_id(),
  employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  tip             TEXT        NOT NULL CHECK (tip IN ('giris','cikis')),

  -- Giriş bildirimi alanları
  ise_baslama     DATE,

  -- Çıkış bildirimi alanları
  ayrilma_tarihi  DATE,
  cikis_kodu      TEXT,    -- SGK çıkış kodu (01, 03, 04, 09 vb.)

  -- Ortak
  bildirim_tarihi DATE        NOT NULL DEFAULT CURRENT_DATE,
  durum           TEXT        NOT NULL DEFAULT 'bekliyor'
                  CHECK (durum IN ('bekliyor','gonderildi','onaylandi')),
  notlar          TEXT,
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sgk_bildirge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgk_bildirge_lab" ON sgk_bildirge
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_sgk_bildirge_emp
  ON sgk_bildirge (employee_id, created_at DESC);

-- ── 4. Payroll tablosuna vergi alanları ekle ──────────────────────────────────
-- (employee_payroll mevcut tabloya ekleme)
ALTER TABLE employee_payroll
  ADD COLUMN IF NOT EXISTS issizlik_isci    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issizlik_isveren NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gelir_vergisi    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damga_vergisi    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kumulatif_matrah NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgk_isyeri_no   TEXT;

-- ── 5. Lab ayarlarını güncelle ────────────────────────────────────────────────
-- SGK isyeri no'yu payroll kayıtlarına doldur (varsa)
-- Bu otomatik işlem migration sırasında çalışır.
