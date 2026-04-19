-- ============================================================
-- 012 — Multi-Tenancy (Faz 1)
-- Her laboratuvar izole veriye sahip olur.
-- Strateji: Row Level Security + lab_id kolonu
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. LABS TABLOSU
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,          -- subdomain: slug.lab.esenkim.com
  owner_id      UUID        REFERENCES profiles(id),  -- lab sahibi (admin)
  plan          TEXT        NOT NULL DEFAULT 'trial'
                            CHECK (plan IN ('trial','starter','pro','enterprise')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE labs ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────
-- 2. MEVCUT LAB'I KAYDET (şimdiki tek müşteri)
-- ──────────────────────────────────────────────────────────────
INSERT INTO labs (id, name, slug, plan, trial_ends_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Esen Dental Lab',
  'esen-dental',
  'pro',
  NOW() + INTERVAL '3650 days'   -- ~10 yıl — mevcut lab hiç expire olmaz
)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 3. TÜM TABLOLARA lab_id EKLE
-- ──────────────────────────────────────────────────────────────
ALTER TABLE profiles        ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE work_orders     ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE clinics         ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE doctors         ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE lab_services    ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE order_items     ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE provas          ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE stock_items     ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE brands          ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE categories      ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);
ALTER TABLE activity_logs   ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES labs(id);

-- ──────────────────────────────────────────────────────────────
-- 4. MEVCUT VERİYİ BACKFILL ET (hepsi mevcut laba ait)
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  DEFAULT_LAB UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE profiles        SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE work_orders     SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE clinics         SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE doctors         SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE lab_services    SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE order_items     SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE provas          SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE stock_items     SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE stock_movements SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE brands          SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE categories      SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
  UPDATE activity_logs   SET lab_id = DEFAULT_LAB WHERE lab_id IS NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTION — kullanıcının lab'ını döndürür
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_lab_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT lab_id FROM profiles WHERE id = auth.uid()
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. AUTO-SET lab_id TRİGGERİ (INSERT sırasında otomatik atar)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_set_lab_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lab_id IS NULL THEN
    NEW.lab_id := get_my_lab_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Her tabloya trigger ekle
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'work_orders','clinics','doctors','lab_services','order_items',
    'provas','stock_items','stock_movements','brands','categories','activity_logs'
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
-- 7. handle_new_user — lab_id'yi JWT meta'dan al
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, user_type, full_name, clinic_name, role, phone, lab_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'lab'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'clinic_name',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'phone',
    CASE
      WHEN NEW.raw_user_meta_data->>'lab_id' IS NOT NULL
        THEN (NEW.raw_user_meta_data->>'lab_id')::UUID
      ELSE NULL   -- SaaS onboarding akışında sonradan atanacak
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- 8. LABS RLS POLİTİKALARI
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can see their own lab" ON labs;
CREATE POLICY "Users can see their own lab"
  ON labs FOR SELECT
  USING (id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 9. WORK_ORDERS RLS — lab izolasyonu ekle
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Doctors see own orders"    ON work_orders;
DROP POLICY IF EXISTS "Lab users see all orders"  ON work_orders;
DROP POLICY IF EXISTS "Doctors can create orders" ON work_orders;
DROP POLICY IF EXISTS "Lab users can update orders" ON work_orders;

CREATE POLICY "Doctors see own orders"
  ON work_orders FOR SELECT
  USING (
    doctor_id = auth.uid()
    AND lab_id = get_my_lab_id()
  );

CREATE POLICY "Lab users see all orders"
  ON work_orders FOR SELECT
  USING (
    is_lab_user()
    AND lab_id = get_my_lab_id()
  );

CREATE POLICY "Doctors can create orders"
  ON work_orders FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND lab_id = get_my_lab_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'doctor')
  );

CREATE POLICY "Lab users can update orders"
  ON work_orders FOR UPDATE
  USING (
    is_lab_user()
    AND lab_id = get_my_lab_id()
  );

CREATE POLICY "Lab users can delete orders"
  ON work_orders FOR DELETE
  USING (
    is_lab_user()
    AND lab_id = get_my_lab_id()
  );

-- ──────────────────────────────────────────────────────────────
-- 10. PROFILES RLS — lab izolasyonu ekle
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lab users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Own profile readable"            ON profiles;
DROP POLICY IF EXISTS "Own profile updatable"           ON profiles;

CREATE POLICY "Own profile readable"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Lab users can read lab profiles"
  ON profiles FOR SELECT
  USING (
    is_lab_user()
    AND lab_id = get_my_lab_id()
  );

CREATE POLICY "Own profile updatable"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ──────────────────────────────────────────────────────────────
-- 11. KLİNİKLER & HEKİMLER RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users manage clinics" ON clinics;
CREATE POLICY "Lab users manage clinics"
  ON clinics FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage doctors" ON doctors;
CREATE POLICY "Lab users manage doctors"
  ON doctors FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 12. STOK RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE stock_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users manage stock_items" ON stock_items;
CREATE POLICY "Lab users manage stock_items"
  ON stock_items FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage stock_movements" ON stock_movements;
CREATE POLICY "Lab users manage stock_movements"
  ON stock_movements FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage brands" ON brands;
CREATE POLICY "Lab users manage brands"
  ON brands FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage categories" ON categories;
CREATE POLICY "Lab users manage categories"
  ON categories FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 13. DİĞER TABLOLAR RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE lab_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE provas       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users manage lab_services" ON lab_services;
CREATE POLICY "Lab users manage lab_services"
  ON lab_services FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage order_items" ON order_items;
CREATE POLICY "Lab users manage order_items"
  ON order_items FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage provas" ON provas;
CREATE POLICY "Lab users manage provas"
  ON provas FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- ──────────────────────────────────────────────────────────────
-- 14. PERFORMANS İÇİN INDEX'LER
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_lab_id        ON profiles(lab_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_lab_id     ON work_orders(lab_id);
CREATE INDEX IF NOT EXISTS idx_clinics_lab_id         ON clinics(lab_id);
CREATE INDEX IF NOT EXISTS idx_doctors_lab_id         ON doctors(lab_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_lab_id     ON stock_items(lab_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lab_id ON stock_movements(lab_id);
CREATE INDEX IF NOT EXISTS idx_brands_lab_id          ON brands(lab_id);
CREATE INDEX IF NOT EXISTS idx_categories_lab_id      ON categories(lab_id);
