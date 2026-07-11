-- ============================================================
-- 20260508 — stage_status enum'a 'skipped' değerini ekle
--
-- NOT: Postgres'te yeni eklenen ENUM değerleri aynı transaction içinde
-- kullanılamaz ("unsafe use of new value" hatası). Bu yüzden enum
-- değişikliği AYRI migration olarak çalıştırılır; constraint ve RPC
-- güncellemeleri sonraki migration'da gelir.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'skipped' AND enumtypid = 'stage_status'::regtype
  ) THEN
    ALTER TYPE stage_status ADD VALUE 'skipped';
  END IF;
END $$;
