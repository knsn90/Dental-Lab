-- ============================================================
-- Migration: Baseline — Missing Table Definitions
--
-- These tables exist in production (created via dashboard) but
-- were never tracked in migrations. This file ensures a fresh
-- `supabase db reset` can recreate the full schema.
--
-- Uses IF NOT EXISTS so it's safe to run on existing databases.
-- ============================================================

-- ─── 1. stock_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  quantity        NUMERIC NOT NULL DEFAULT 0,
  min_quantity    NUMERIC NOT NULL DEFAULT 0,
  unit            TEXT,                              -- adet, ml, gr, mm vb.
  category        TEXT,
  supplier        TEXT,
  brand           TEXT,
  type            TEXT,                              -- malzeme tipi
  usage_category  TEXT CHECK (usage_category IN ('production', 'office', 'misc')),
  units_per_tooth NUMERIC,
  consume_at_stage TEXT,
  unit_cost       NUMERIC,
  unit_price      NUMERIC,                           -- birim fiyat (maliyet hesabı)
  location        TEXT,
  barcode         TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_lab_id   ON stock_items(lab_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_location ON stock_items(location);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_barcode ON stock_items(barcode) WHERE barcode IS NOT NULL;

-- ─── 2. stock_movements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  item_id         TEXT,                              -- stok malzeme referansı
  order_id        UUID,                              -- hangi iş emri için
  item_name       TEXT,                              -- denormalized kolay erişim
  type            TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'WASTE', 'ADJUST')),
  quantity        NUMERIC NOT NULL,
  unit            TEXT,
  unit_cost_at_time NUMERIC,                         -- o andaki birim maliyet
  note            TEXT,
  notes           TEXT,                              -- stage bilgisi de buraya
  source          TEXT,
  stage           TEXT,
  user_id         UUID REFERENCES profiles(id),
  is_reversed     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_lab_id     ON stock_movements(lab_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item       ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order      ON stock_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created    ON stock_movements(created_at);

-- ─── 3. order_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID,
  work_order_id   UUID NOT NULL,
  service_id      UUID,                              -- lab_services referansı
  name            TEXT NOT NULL,
  price           NUMERIC NOT NULL DEFAULT 0,
  quantity        INT NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_work_order ON order_items(work_order_id);

-- ─── 4. materials (hizmet malzeme kataloğu) ─────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  price           NUMERIC DEFAULT 0,
  category        TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_lab ON materials(lab_id);

-- ─── 5. brands ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  supplier        TEXT,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name_lab ON brands(name, lab_id);
CREATE INDEX IF NOT EXISTS idx_brands_lab_id ON brands(lab_id);

-- ─── 6. categories ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_lab ON categories(name, lab_id);
CREATE INDEX IF NOT EXISTS idx_categories_lab_id ON categories(lab_id);

-- ─── 7. provas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  work_order_id   UUID NOT NULL,
  order_item_id   UUID REFERENCES order_items(id) ON DELETE SET NULL,
  order_item_name TEXT,
  prova_number    INT DEFAULT 1,
  prova_type      TEXT CHECK (prova_type IN ('bisküvi', 'metal', 'seramik', 'bitmek', 'teslim')),
  scheduled_date  DATE,
  sent_date       DATE,
  return_date     DATE,
  quota           INT,
  doctor_notes    TEXT,
  lab_notes       TEXT,
  status          TEXT NOT NULL DEFAULT 'planlandı'
    CHECK (status IN ('planlandı', 'gönderildi', 'döndü', 'tamamlandı')),
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provas_work_order ON provas(work_order_id);
CREATE INDEX IF NOT EXISTS idx_provas_lab        ON provas(lab_id);

-- ─── 8. promotions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC NOT NULL DEFAULT 0,
  scope           TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'category', 'services')),
  category        TEXT,
  clinic_ids      TEXT[],                            -- array of clinic UUIDs (text)
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_lab ON promotions(lab_id);

-- ─── 9. lab_services ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  name            TEXT NOT NULL,
  category        TEXT,
  price           NUMERIC NOT NULL DEFAULT 0,
  currency        TEXT DEFAULT 'TRY',
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_services_lab    ON lab_services(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_services_active ON lab_services(is_active);

-- ─── 10. clinic_price_overrides ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_price_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID REFERENCES profiles(id),
  clinic_id       UUID NOT NULL,
  service_id      UUID REFERENCES lab_services(id) ON DELETE CASCADE,
  custom_price    NUMERIC,
  discount_percent NUMERIC,
  currency        TEXT DEFAULT 'TRY',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_overrides_clinic  ON clinic_price_overrides(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_overrides_service ON clinic_price_overrides(service_id);

-- ─── RLS (tüm tablolar) ────────────────────────────────────────────────
ALTER TABLE stock_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials               ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE provas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_services            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_price_overrides  ENABLE ROW LEVEL SECURITY;

-- Lab-scoped policies: users can only access their own lab's data
-- Uses is_lab_user() + get_my_lab_id() functions from migration 012
-- Tables already covered by 012: stock_items, stock_movements, brands,
-- categories, lab_services, order_items, provas
-- Tables NOT covered (need new policies): materials, promotions, clinic_price_overrides

DROP POLICY IF EXISTS "Lab users manage materials" ON materials;
CREATE POLICY "Lab users manage materials"
  ON materials FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage promotions" ON promotions;
CREATE POLICY "Lab users manage promotions"
  ON promotions FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS "Lab users manage clinic_price_overrides" ON clinic_price_overrides;
CREATE POLICY "Lab users manage clinic_price_overrides"
  ON clinic_price_overrides FOR ALL
  USING (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- Clinic users can read their own price overrides
DROP POLICY IF EXISTS "Clinic users read own overrides" ON clinic_price_overrides;
CREATE POLICY "Clinic users read own overrides"
  ON clinic_price_overrides FOR SELECT
  USING (
    clinic_id IN (
      SELECT id FROM clinics WHERE clinics.id = clinic_id
    )
    AND auth.uid() IS NOT NULL
  );

-- Doctor/clinic users can read lab services (for ordering)
DROP POLICY IF EXISTS "Authenticated read lab_services" ON lab_services;
CREATE POLICY "Authenticated read lab_services"
  ON lab_services FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = TRUE);
