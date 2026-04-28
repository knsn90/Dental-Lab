-- ============================================================
-- 039_workflow_engine.sql
-- İş emri üretim akışı — istasyonlar, atamalar, kutular,
-- kurye takibi ve analitik olay kaydı
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUM GENİŞLETME
-- ────────────────────────────────────────────────────────────

-- work_order_status'a yeni adımlar ekleniyor
-- (PostgreSQL sadece ADD VALUE destekler, sırayı koruyoruz)
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'kutu_atandi'        AFTER 'alindi';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'atama_bekleniyor'   AFTER 'kutu_atandi';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'asamada'            AFTER 'atama_bekleniyor';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'kurye_bekleniyor'   AFTER 'teslimata_hazir';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'kuryede'            AFTER 'kurye_bekleniyor';

-- İş girdi türü (dijital dosya mı, fiziki model mi, her ikisi mi?)
CREATE TYPE order_input_type AS ENUM ('dijital', 'model', 'ikisi');

-- İstasyon geçiş durumu
CREATE TYPE stage_status AS ENUM (
  'bekliyor',       -- henüz bu istasyona gelmedi
  'aktif',          -- teknisyen teslim aldı, çalışıyor
  'tamamlandi',     -- teknisyen tamamladı, onay bekleniyor
  'onaylandi',      -- mesul müdür onayladı, sonraki aşamaya geçti
  'reddedildi'      -- mesul müdür reddetti, teknisyene iade
);

-- Kurye türü
CREATE TYPE courier_type AS ENUM ('iç', 'dış');

-- Kurye teslimat durumu
CREATE TYPE delivery_status AS ENUM (
  'atandi',         -- kuryeye atandı
  'teslim_alindi',  -- kurye işi fiziki olarak aldı
  'yolda',          -- GPS aktif
  'teslim_edildi',  -- hedefe ulaştı
  'iade'            -- teslim edilemedi, iade
);

-- Olay türleri (analytics için)
CREATE TYPE order_event_type AS ENUM (
  'olusturuldu',
  'kutu_atandi',
  'rota_planlandi',
  'teknisyen_atandi',
  'aşama_basladi',
  'aşama_tamamlandi',
  'aşama_onaylandi',
  'aşama_reddedildi',
  'kalite_gecti',
  'kuryeye_verildi',
  'teslim_edildi',
  'not_eklendi',
  'fotograf_eklendi'
);

-- ────────────────────────────────────────────────────────────
-- 2. MEVCUT work_orders TABLOSUNA KOLON EKLEMELERİ
-- ────────────────────────────────────────────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS input_type      order_input_type DEFAULT 'model',
  ADD COLUMN IF NOT EXISTS is_rush         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS box_id          UUID,   -- FK sonra eklenecek (circular ref önlemek için)
  ADD COLUMN IF NOT EXISTS current_stage_id UUID,  -- FK sonra
  ADD COLUMN IF NOT EXISTS manager_notes   TEXT;

-- ────────────────────────────────────────────────────────────
-- 3. KUTULAR (Fiziki iş kutuları — e-paper ekranlı)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_boxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_code        TEXT NOT NULL UNIQUE,          -- 'BOX-001', 'BOX-042' ...
  qr_payload      TEXT GENERATED ALWAYS AS (id::TEXT) STORED,
  epaper_device_id TEXT,                         -- e-paper ekran donanım ID'si (ileride)
  current_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  is_available    BOOLEAN GENERATED ALWAYS AS (current_order_id IS NULL) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- work_orders.box_id FK'sını şimdi bağlayabiliriz
ALTER TABLE work_orders
  ADD CONSTRAINT fk_work_orders_box
  FOREIGN KEY (box_id) REFERENCES order_boxes(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 4. İSTASYONLAR (Lab bazında yapılandırılabilir)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_stations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,               -- 'Tasarım', 'Porselen', 'Tesviye' ...
  color           TEXT DEFAULT '#2563EB',      -- UI rengi
  icon            TEXT DEFAULT 'tool',         -- AppIcon adı
  sequence_hint   INTEGER DEFAULT 0,           -- varsayılan sıralama ipucu
  is_critical     BOOLEAN DEFAULT FALSE,       -- TRUE → geçiş için mesul müdür onayı şart
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lab_profile_id, name)
);

-- Örnek istasyonlar her yeni lab için otomatik oluşturmak isterseniz
-- trigger yerine uygulama katmanında seed yapılacak.

-- ────────────────────────────────────────────────────────────
-- 5. İŞ EMRİ ROTA PLANI
-- Her iş emri için sıralı istasyon adımları
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  station_id      UUID NOT NULL REFERENCES lab_stations(id) ON DELETE RESTRICT,
  technician_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sequence_order  INTEGER NOT NULL,            -- 1, 2, 3 ...
  status          stage_status NOT NULL DEFAULT 'bekliyor',
  is_critical     BOOLEAN NOT NULL DEFAULT FALSE, -- istasyon.is_critical kopyası (snapshot)
  -- Zamanlama
  assigned_at     TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- İçerik
  technician_note TEXT,
  manager_note    TEXT,
  duration_min    INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (completed_at - started_at)) / 60
      ELSE NULL
    END::INTEGER
  ) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_order_id, sequence_order)
);

-- work_orders.current_stage_id FK
ALTER TABLE work_orders
  ADD CONSTRAINT fk_work_orders_stage
  FOREIGN KEY (current_stage_id) REFERENCES order_stages(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 6. AŞAMA FOTOĞRAFLARI
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        UUID NOT NULL REFERENCES order_stages(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  uploaded_by     UUID NOT NULL REFERENCES profiles(id),
  caption         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 7. KURYE YÖNETİMİ
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS couriers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID REFERENCES profiles(id) ON DELETE SET NULL, -- iç kurye
  lab_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  courier_type    courier_type NOT NULL DEFAULT 'iç',
  company_name    TEXT,                        -- dış kurye firma adı (UPS, MNG ...)
  tracking_url_template TEXT,                  -- dış kurye takip URL'i
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 8. TESLİMATLAR
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  courier_id      UUID NOT NULL REFERENCES couriers(id) ON DELETE RESTRICT,
  status          delivery_status NOT NULL DEFAULT 'atandi',
  -- Dış kurye için
  external_tracking_code TEXT,
  -- Zamanlama
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  picked_up_at    TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  -- Alıcı onayı
  recipient_name  TEXT,
  recipient_note  TEXT,
  signature_path  TEXT,                        -- Storage'da imza görseli
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 9. GPS PING TABLOSU (Canlı kurye konumu)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gps_pings (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id     UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy_m      REAL,                        -- metre cinsinden doğruluk
  speed_kmh       REAL,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- GPS pingleri için zaman serisi indeksi
CREATE INDEX IF NOT EXISTS idx_gps_pings_delivery_time
  ON gps_pings (delivery_id, recorded_at DESC);

-- ────────────────────────────────────────────────────────────
-- 10. OLAY KAYDI (Analytics — immutable append-only)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_id        UUID REFERENCES order_stages(id) ON DELETE SET NULL,
  delivery_id     UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  event_type      order_event_type NOT NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}',          -- esnek ek veri
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order  ON order_events (work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_actor  ON order_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_type   ON order_events (event_type, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 11. ANALİTİK VIEW'LAR
-- ────────────────────────────────────────────────────────────

-- A) İstasyon bazında ortalama süre (darboğaz analizi)
CREATE OR REPLACE VIEW v_station_analytics AS
SELECT
  s.id                                          AS station_id,
  s.name                                        AS station_name,
  s.lab_profile_id,
  COUNT(os.id)                                  AS total_stages,
  COUNT(os.id) FILTER (WHERE os.status = 'onaylandi') AS completed,
  COUNT(os.id) FILTER (WHERE os.status = 'reddedildi') AS rejected,
  ROUND(AVG(os.duration_min) FILTER (WHERE os.duration_min IS NOT NULL))::INT AS avg_duration_min,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY os.duration_min) FILTER (WHERE os.duration_min IS NOT NULL))::INT AS median_duration_min,
  -- Beklemede ortalama süre (atama → başlama)
  ROUND(AVG(EXTRACT(EPOCH FROM (os.started_at - os.assigned_at)) / 60)
    FILTER (WHERE os.started_at IS NOT NULL AND os.assigned_at IS NOT NULL))::INT AS avg_wait_min
FROM lab_stations s
LEFT JOIN order_stages os ON os.station_id = s.id
GROUP BY s.id, s.name, s.lab_profile_id;

-- B) Teknisyen performans özeti
CREATE OR REPLACE VIEW v_technician_performance AS
SELECT
  p.id                                           AS technician_id,
  p.full_name,
  COUNT(os.id)                                   AS total_stages,
  COUNT(os.id) FILTER (WHERE os.status = 'onaylandi') AS approved,
  COUNT(os.id) FILTER (WHERE os.status = 'reddedildi') AS rejected,
  ROUND(
    100.0 * COUNT(os.id) FILTER (WHERE os.status = 'onaylandi')
    / NULLIF(COUNT(os.id) FILTER (WHERE os.status IN ('onaylandi','reddedildi')), 0),
  1) AS approval_rate_pct,
  ROUND(AVG(os.duration_min) FILTER (WHERE os.duration_min IS NOT NULL))::INT AS avg_duration_min
FROM profiles p
LEFT JOIN order_stages os ON os.technician_id = p.id
WHERE p.user_type = 'lab'
GROUP BY p.id, p.full_name;

-- C) Aktif iş emri pano görünümü (Kanban için)
CREATE OR REPLACE VIEW v_active_orders_kanban AS
SELECT
  wo.id,
  wo.order_number,
  wo.work_type,
  wo.delivery_date,
  wo.is_rush,
  wo.status,
  wo.input_type,
  ob.box_code,
  -- Mevcut aşama bilgisi
  cs.id                      AS current_stage_id,
  cs.sequence_order          AS current_sequence,
  cs.status                  AS stage_status,
  cs.started_at              AS stage_started_at,
  ls.name                    AS current_station_name,
  ls.color                   AS current_station_color,
  -- Teknisyen
  tp.id                      AS technician_id,
  tp.full_name               AS technician_name,
  -- Hekim / Klinik
  dp.full_name               AS doctor_name,
  dp.clinic_name
FROM work_orders wo
LEFT JOIN order_boxes    ob ON ob.id = wo.box_id
LEFT JOIN order_stages   cs ON cs.id = wo.current_stage_id
LEFT JOIN lab_stations   ls ON ls.id = cs.station_id
LEFT JOIN profiles       tp ON tp.id = cs.technician_id
LEFT JOIN profiles       dp ON dp.id = wo.doctor_id
WHERE wo.status NOT IN ('teslim_edildi');

-- ────────────────────────────────────────────────────────────
-- 12. YARDIMCI FONKSİYONLAR
-- ────────────────────────────────────────────────────────────

-- A) Sonraki aşamaya geç
-- Mevcut aşamayı 'onaylandi' yapar, iş emrini sonraki bekleyen aşamaya ilerletir
CREATE OR REPLACE FUNCTION advance_to_next_stage(
  p_work_order_id UUID,
  p_approver_id   UUID,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current  order_stages%ROWTYPE;
  v_next     order_stages%ROWTYPE;
BEGIN
  -- Mevcut aktif aşamayı bul
  SELECT * INTO v_current
  FROM order_stages
  WHERE work_order_id = p_work_order_id
    AND status IN ('tamamlandi', 'aktif')
  ORDER BY sequence_order
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aktif aşama bulunamadı');
  END IF;

  -- Mevcut aşamayı onayla
  UPDATE order_stages SET
    status      = 'onaylandi',
    approved_at = NOW(),
    approved_by = p_approver_id,
    manager_note = COALESCE(p_note, manager_note)
  WHERE id = v_current.id;

  -- Olay kaydı
  INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, v_current.id, 'aşama_onaylandi', p_approver_id,
    jsonb_build_object('sequence', v_current.sequence_order));

  -- Sonraki aşamayı bul
  SELECT * INTO v_next
  FROM order_stages
  WHERE work_order_id = p_work_order_id
    AND sequence_order > v_current.sequence_order
    AND status = 'bekliyor'
  ORDER BY sequence_order
  LIMIT 1;

  IF FOUND THEN
    -- Sonraki aşamayı aktifleştir
    UPDATE order_stages SET status = 'aktif', assigned_at = NOW()
    WHERE id = v_next.id;

    UPDATE work_orders SET current_stage_id = v_next.id, status = 'asamada'
    WHERE id = p_work_order_id;

    RETURN jsonb_build_object('ok', true, 'next_stage_id', v_next.id,
      'station', v_next.station_id);
  ELSE
    -- Tüm aşamalar tamamlandı → kalite kontrole geç
    UPDATE work_orders SET
      current_stage_id = NULL,
      status           = 'kalite_kontrol'
    WHERE id = p_work_order_id;

    INSERT INTO order_events (work_order_id, event_type, actor_id)
    VALUES (p_work_order_id, 'kalite_gecti', p_approver_id);

    RETURN jsonb_build_object('ok', true, 'next_stage_id', NULL,
      'status', 'kalite_kontrol');
  END IF;
END;
$$;

-- B) Aşamayı reddet (teknisyene iade)
CREATE OR REPLACE FUNCTION reject_stage(
  p_stage_id    UUID,
  p_approver_id UUID,
  p_reason      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wo_id UUID;
BEGIN
  UPDATE order_stages SET
    status       = 'reddedildi',
    manager_note = p_reason,
    approved_by  = p_approver_id,
    approved_at  = NOW(),
    -- Sıfırla — tekrar çalışmaya başlayacak
    completed_at = NULL,
    started_at   = NULL
  WHERE id = p_stage_id
  RETURNING work_order_id INTO v_wo_id;

  -- Reddedilen aşamayı tekrar aktif yap
  UPDATE order_stages SET status = 'aktif' WHERE id = p_stage_id;

  INSERT INTO order_events (work_order_id, stage_id, event_type, actor_id,
    metadata)
  VALUES (v_wo_id, p_stage_id, 'aşama_reddedildi', p_approver_id,
    jsonb_build_object('reason', p_reason));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 13. INDEX'LER
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_order_stages_order    ON order_stages (work_order_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_order_stages_tech     ON order_stages (technician_id, status);
CREATE INDEX IF NOT EXISTS idx_order_stages_station  ON order_stages (station_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_status    ON work_orders  (status);
CREATE INDEX IF NOT EXISTS idx_work_orders_stage     ON work_orders  (current_stage_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier    ON deliveries   (courier_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_order      ON deliveries   (work_order_id);

-- ────────────────────────────────────────────────────────────
-- 14. RLS POLİTİKALARI
-- ────────────────────────────────────────────────────────────

ALTER TABLE order_boxes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_stations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_stages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE couriers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_pings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events     ENABLE ROW LEVEL SECURITY;

-- Lab kullanıcıları kendi lab verilerini okuyabilir
CREATE POLICY lab_stations_select ON lab_stations
  FOR SELECT USING (
    lab_profile_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid()
        OR (user_type = 'lab' AND id = (SELECT id FROM profiles WHERE id = auth.uid()))
    )
    OR auth.uid() IN (
      SELECT id FROM profiles WHERE user_type = 'lab'
    )
  );

-- order_stages: lab kullanıcıları + ilgili hekim okuyabilir
CREATE POLICY order_stages_select ON order_stages
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

-- Teknisyen sadece kendi aşamasını güncelleyebilir
CREATE POLICY order_stages_technician_update ON order_stages
  FOR UPDATE USING (
    technician_id = auth.uid()
    AND status IN ('aktif')
  );

-- Mesul müdür / admin tüm order_stages'i güncelleyebilir
CREATE POLICY order_stages_manager_update ON order_stages
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE user_type = 'lab' AND role IN ('manager', 'admin')
    )
    OR auth.uid() IN (SELECT id FROM profiles WHERE user_type = 'admin')
  );

-- GPS pingleri: kurye INSERT, lab + hekim SELECT
CREATE POLICY gps_pings_insert ON gps_pings
  FOR INSERT WITH CHECK (
    delivery_id IN (
      SELECT d.id FROM deliveries d
      JOIN couriers c ON c.id = d.courier_id
      WHERE c.profile_id = auth.uid()
    )
  );

CREATE POLICY gps_pings_select ON gps_pings
  FOR SELECT USING (
    -- Lab kullanıcıları
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR
    -- İlgili hekim
    auth.uid() IN (
      SELECT wo.doctor_id FROM deliveries d
      JOIN work_orders wo ON wo.id = d.work_order_id
      WHERE d.id = delivery_id
    )
    OR
    -- Kurye kendisi
    auth.uid() IN (
      SELECT c.profile_id FROM deliveries d
      JOIN couriers c ON c.id = d.courier_id
      WHERE d.id = delivery_id
    )
  );

-- order_events: lab + admin + ilgili hekim okuyabilir
CREATE POLICY order_events_select ON order_events
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab', 'admin'))
    OR auth.uid() = (SELECT doctor_id FROM work_orders WHERE id = work_order_id)
  );

-- Sistem fonksiyonları SECURITY DEFINER olduğu için INSERT doğrudan yapılır
-- Uygulama INSERT'lere izin verilmez (append-only)
CREATE POLICY order_events_no_direct_insert ON order_events
  FOR INSERT WITH CHECK (FALSE);

-- ────────────────────────────────────────────────────────────
-- 15. REALTIME (GPS + Stage güncellemeleri için)
-- ────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE order_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE gps_pings;
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
