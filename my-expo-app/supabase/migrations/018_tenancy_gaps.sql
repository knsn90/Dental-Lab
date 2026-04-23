-- ============================================================
-- 018 — Multi-Tenancy (Faz 2): 012'de unutulan 5 tabloyu kapat
-- ============================================================
-- 012 şu 12 tabloya lab_id ekledi:
--   profiles, work_orders, clinics, doctors, lab_services, order_items,
--   provas, stock_items, stock_movements, brands, categories, activity_logs
--
-- Ama şu 5 tablo ATLANDI — hâlâ lab_id yok ve RLS politikaları
-- `is_lab_user()` ile sadece "lab personeli mi" kontrol ediyor;
-- "HANGİ lab'ın personeli" kontrolü yapmıyor. Bu, çok-kiracılı (SaaS)
-- senaryoda başka lab'ın verisine erişim açığı demek.
--
-- Bu migration:
--   1. Eksik 5 tabloya lab_id UUID REFERENCES labs(id) ekler
--   2. Mevcut verileri parent work_orders.lab_id'den backfill eder
--   3. Tüm eski RLS politikalarını lab_id'ye duyarlı yenileriyle değiştirir
--   4. auto_set_lab_id trigger'ını ekler (INSERT'te lab_id otomatik gelsin)
--   5. lab_id üzerinde index ekler (sorgu performansı)
--
-- Idempotent: tekrar çalıştırılabilir, güvenli.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. KOLON EKLE (eksikse)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE work_order_photos ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE status_history    ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE order_messages    ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE case_steps        ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE approvals         ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);

-- ──────────────────────────────────────────────────────────────
-- 2. BACKFILL — parent work_orders.lab_id'den türet
--    (012'den sonra work_orders.lab_id zaten dolu)
-- ──────────────────────────────────────────────────────────────
UPDATE work_order_photos p
  SET lab_id = wo.lab_id
  FROM work_orders wo
  WHERE p.work_order_id = wo.id
    AND p.lab_id IS NULL;

UPDATE status_history sh
  SET lab_id = wo.lab_id
  FROM work_orders wo
  WHERE sh.work_order_id = wo.id
    AND sh.lab_id IS NULL;

UPDATE order_messages om
  SET lab_id = wo.lab_id
  FROM work_orders wo
  WHERE om.work_order_id = wo.id
    AND om.lab_id IS NULL;

UPDATE case_steps cs
  SET lab_id = wo.lab_id
  FROM work_orders wo
  WHERE cs.work_order_id = wo.id
    AND cs.lab_id IS NULL;

UPDATE approvals a
  SET lab_id = wo.lab_id
  FROM work_orders wo
  WHERE a.work_order_id = wo.id
    AND a.lab_id IS NULL;

-- Kalan NULL kayıtları (parent work_order silinmiş/orphan olanlar) default lab'a ata.
-- Bunlar olmayacak normalde (ON DELETE CASCADE var) ama güvenlik için.
DO $$
DECLARE
  DEFAULT_LAB UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE work_order_photos SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE status_history    SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE order_messages    SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE case_steps        SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE approvals         SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 3. AUTO-SET TRIGGER — INSERT sırasında lab_id otomatik gelsin
--    (012'deki auto_set_lab_id() fonksiyonu hazır)
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'work_order_photos',
    'status_history',
    'order_messages',
    'case_steps',
    'approvals'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS %I ON %I;
      CREATE TRIGGER %I
        BEFORE INSERT ON %I
        FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();
    ',
      tbl || '_auto_lab_id', tbl,
      tbl || '_auto_lab_id', tbl
    );
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS — eski lab_id'siz politikaları sök, lab_id'li olanı koy
-- ──────────────────────────────────────────────────────────────

-- work_order_photos ────────────────────────────────────────────
ALTER TABLE work_order_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photos: visible if order is accessible"  ON work_order_photos;
DROP POLICY IF EXISTS "Doctors upload photos for own orders"    ON work_order_photos;
DROP POLICY IF EXISTS "Lab users can upload photos"             ON work_order_photos;
DROP POLICY IF EXISTS "photos_select_lab"                       ON work_order_photos;
DROP POLICY IF EXISTS "photos_select_doctor"                    ON work_order_photos;
DROP POLICY IF EXISTS "photos_insert_lab"                       ON work_order_photos;
DROP POLICY IF EXISTS "photos_insert_doctor"                    ON work_order_photos;
DROP POLICY IF EXISTS "photos_delete_lab"                       ON work_order_photos;

CREATE POLICY "photos_select_lab"
  ON work_order_photos FOR SELECT
  USING (is_lab_user() AND lab_id = get_my_lab_id());

CREATE POLICY "photos_select_doctor"
  ON work_order_photos FOR SELECT
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_photos.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

CREATE POLICY "photos_insert_lab"
  ON work_order_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND is_lab_user()
    AND lab_id = get_my_lab_id()
  );

CREATE POLICY "photos_insert_doctor"
  ON work_order_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders
      WHERE id = work_order_id AND doctor_id = auth.uid()
    )
  );

CREATE POLICY "photos_delete_lab"
  ON work_order_photos FOR DELETE
  USING (is_lab_user() AND lab_id = get_my_lab_id());

-- status_history ───────────────────────────────────────────────
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Status history: visible if order is accessible" ON status_history;
DROP POLICY IF EXISTS "Lab users can insert status history"            ON status_history;
DROP POLICY IF EXISTS "status_history_select_lab"                      ON status_history;
DROP POLICY IF EXISTS "status_history_select_doctor"                   ON status_history;
DROP POLICY IF EXISTS "status_history_insert_lab"                      ON status_history;

CREATE POLICY "status_history_select_lab"
  ON status_history FOR SELECT
  USING (is_lab_user() AND lab_id = get_my_lab_id());

CREATE POLICY "status_history_select_doctor"
  ON status_history FOR SELECT
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = status_history.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

CREATE POLICY "status_history_insert_lab"
  ON status_history FOR INSERT
  WITH CHECK (
    changed_by = auth.uid()
    AND is_lab_user()
    AND lab_id = get_my_lab_id()
  );

-- order_messages ───────────────────────────────────────────────
ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_messages_lab_admin"  ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor"     ON order_messages;
DROP POLICY IF EXISTS "order_messages_lab"        ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor_own" ON order_messages;

CREATE POLICY "order_messages_lab"
  ON order_messages FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

CREATE POLICY "order_messages_doctor_own"
  ON order_messages FOR ALL
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- case_steps ───────────────────────────────────────────────────
ALTER TABLE case_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_all_case_steps" ON case_steps;
DROP POLICY IF EXISTS "case_steps_lab"     ON case_steps;

CREATE POLICY "case_steps_lab"
  ON case_steps FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- approvals ────────────────────────────────────────────────────
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_all_approvals"    ON approvals;
DROP POLICY IF EXISTS "approvals_lab"        ON approvals;
DROP POLICY IF EXISTS "approvals_doctor_own" ON approvals;

CREATE POLICY "approvals_lab"
  ON approvals FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

CREATE POLICY "approvals_doctor_own"
  ON approvals FOR ALL
  USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = approvals.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  )
  WITH CHECK (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = approvals.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 5. INDEX — lab_id sorgularını hızlandır
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_work_order_photos_lab_id ON work_order_photos(lab_id);
CREATE INDEX IF NOT EXISTS idx_status_history_lab_id    ON status_history(lab_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_lab_id    ON order_messages(lab_id);
CREATE INDEX IF NOT EXISTS idx_case_steps_lab_id        ON case_steps(lab_id);
CREATE INDEX IF NOT EXISTS idx_approvals_lab_id         ON approvals(lab_id);
