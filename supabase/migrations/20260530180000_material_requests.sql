-- ═══════════════════════════════════════════════════════════════════════
--  Material Requests — Teknisyen / Mesul Müdür → Admin sarf-alet talep
--
--  3 kademeli onay zinciri:
--   1) Teknisyen talep oluşturur → 'submitted' (mesul müdür onayına)
--   2) Mesul müdür yönlendirir   → 'forwarded_admin' (admin onayına)
--      veya reddeder                → 'rejected_manager'
--   3) Admin onaylar               → 'approved' → 'ordered' → 'received'
--      veya reddeder                → 'rejected_admin'
--
--  Mesul müdür (user_type='lab', role='manager') kendisi talep açarsa
--  doğrudan 'forwarded_admin' statüsünde başlar (manager kademesi skip).
--
--  Notifications.category genişletildi: 'material_request'
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
--  Tablolar
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_request_catalog (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID            NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,
  name        TEXT            NOT NULL,
  category    TEXT            NOT NULL DEFAULT 'sarf'
              CHECK (category IN ('sarf','alet','el_aleti','kimyasal','muhtelif')),
  unit        TEXT            NOT NULL DEFAULT 'adet',
  default_qty NUMERIC(12,3)   DEFAULT 1 CHECK (default_qty > 0),
  notes       TEXT,
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_catalog_lab    ON material_request_catalog (lab_id);
CREATE INDEX IF NOT EXISTS idx_mat_catalog_active ON material_request_catalog (lab_id, is_active);

CREATE TABLE IF NOT EXISTS material_requests (
  id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no     TEXT,                                                       -- otomatik MR-YYYY-NNNN
  lab_id         UUID            NOT NULL DEFAULT get_my_lab_id() REFERENCES labs(id) ON DELETE CASCADE,

  -- Talep eden
  requester_id   UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  requester_type TEXT            NOT NULL
                 CHECK (requester_type IN ('technician','manager','other')),

  -- Genel
  title          TEXT            NOT NULL,
  reason         TEXT,
  urgency        TEXT            NOT NULL DEFAULT 'normal'
                 CHECK (urgency IN ('low','normal','high','critical')),
  needed_by      DATE,
  attachment_url TEXT,

  -- Durum makinesi
  status         TEXT            NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('draft','submitted','forwarded_admin',
                                   'rejected_manager','rejected_admin',
                                   'approved','ordered','received','cancelled','closed')),

  -- Manager kademesi
  manager_id        UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  manager_action_at TIMESTAMPTZ,
  manager_note      TEXT,

  -- Admin kademesi
  admin_id          UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  admin_action_at   TIMESTAMPTZ,
  admin_note        TEXT,
  reject_reason     TEXT,

  -- Satınalma izi (sade — purchase_invoices entegrasyonu kapsam dışı)
  supplier_id    UUID            REFERENCES suppliers(id) ON DELETE SET NULL,
  ordered_at     DATE,
  expected_at    DATE,
  received_at    DATE,
  total_cost     NUMERIC(12,2),

  submitted_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_lab       ON material_requests (lab_id);
CREATE INDEX IF NOT EXISTS idx_mat_req_status    ON material_requests (lab_id, status);
CREATE INDEX IF NOT EXISTS idx_mat_req_requester ON material_requests (requester_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mat_req_manager   ON material_requests (manager_id);

CREATE TABLE IF NOT EXISTS material_request_items (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID            NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  catalog_id       UUID            REFERENCES material_request_catalog(id) ON DELETE SET NULL,
  name             TEXT            NOT NULL,
  category         TEXT,
  unit             TEXT            NOT NULL DEFAULT 'adet',
  quantity         NUMERIC(12,3)   NOT NULL CHECK (quantity > 0),
  est_unit_cost    NUMERIC(12,2),
  approved_qty     NUMERIC(12,3),
  actual_unit_cost NUMERIC(12,2),
  notes            TEXT,
  sort_order       INT             NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_items_request ON material_request_items (request_id);

CREATE TABLE IF NOT EXISTS material_request_events (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID            NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  actor_id    UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role  TEXT,
  action      TEXT            NOT NULL
              CHECK (action IN ('created','submitted','auto_forwarded_self','forwarded',
                                'rejected_manager','rejected_admin','approved',
                                'ordered','received','closed','cancelled','commented','updated')),
  note        TEXT,
  payload     JSONB           NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_events_request ON material_request_events (request_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
--  Trigger'lar: request_no + updated_at
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_material_request_no()
RETURNS TRIGGER AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW())::INT;
  v_seq  INT;
BEGIN
  IF NEW.request_no IS NULL OR LENGTH(BTRIM(NEW.request_no)) = 0 THEN
    SELECT COUNT(*) + 1 INTO v_seq
      FROM material_requests
     WHERE lab_id = NEW.lab_id
       AND EXTRACT(YEAR FROM created_at)::INT = v_year;
    NEW.request_no := 'MR-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_requests_request_no ON material_requests;
CREATE TRIGGER trg_material_requests_request_no
  BEFORE INSERT ON material_requests
  FOR EACH ROW EXECUTE FUNCTION set_material_request_no();

CREATE OR REPLACE FUNCTION touch_material_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_requests_touch ON material_requests;
CREATE TRIGGER trg_material_requests_touch
  BEFORE UPDATE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION touch_material_requests_updated_at();

DROP TRIGGER IF EXISTS trg_material_catalog_touch ON material_request_catalog;
CREATE TRIGGER trg_material_catalog_touch
  BEFORE UPDATE ON material_request_catalog
  FOR EACH ROW EXECUTE FUNCTION touch_material_requests_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
--  RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE material_request_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_request_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_request_events  ENABLE ROW LEVEL SECURITY;

-- Catalog: lab üyeleri okur, manager/admin yazar
DROP POLICY IF EXISTS mat_catalog_lab_select ON material_request_catalog;
CREATE POLICY mat_catalog_lab_select ON material_request_catalog
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS mat_catalog_write ON material_request_catalog;
CREATE POLICY mat_catalog_write ON material_request_catalog
  FOR ALL USING (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role IN ('manager','admin','accountant')))
    )
  )
  WITH CHECK (
    lab_id = get_my_lab_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role IN ('manager','admin','accountant')))
    )
  );

-- Requests: lab üyeleri (=lab/admin/manager) tümünü görür; requester kendi talebini görür
DROP POLICY IF EXISTS mat_req_lab_select ON material_requests;
CREATE POLICY mat_req_lab_select ON material_requests
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS mat_req_lab_insert ON material_requests;
CREATE POLICY mat_req_lab_insert ON material_requests
  FOR INSERT WITH CHECK (
    lab_id = get_my_lab_id()
    AND requester_id = auth.uid()
  );

DROP POLICY IF EXISTS mat_req_lab_update ON material_requests;
CREATE POLICY mat_req_lab_update ON material_requests
  FOR UPDATE USING (lab_id = get_my_lab_id())
  WITH CHECK   (lab_id = get_my_lab_id());

-- Items: parent ile aynı görünürlük
DROP POLICY IF EXISTS mat_req_items_select ON material_request_items;
CREATE POLICY mat_req_items_select ON material_request_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM material_requests r WHERE r.id = request_id AND r.lab_id = get_my_lab_id())
  );

DROP POLICY IF EXISTS mat_req_items_insert ON material_request_items;
CREATE POLICY mat_req_items_insert ON material_request_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM material_requests r
      WHERE r.id = request_id
        AND r.lab_id = get_my_lab_id()
        AND r.requester_id = auth.uid()
        AND r.status IN ('draft','submitted')
    )
  );

DROP POLICY IF EXISTS mat_req_items_update ON material_request_items;
CREATE POLICY mat_req_items_update ON material_request_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM material_requests r WHERE r.id = request_id AND r.lab_id = get_my_lab_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM material_requests r WHERE r.id = request_id AND r.lab_id = get_my_lab_id())
  );

-- Events: lab içi okuma; insert sadece SECURITY DEFINER RPC üzerinden
DROP POLICY IF EXISTS mat_req_events_select ON material_request_events;
CREATE POLICY mat_req_events_select ON material_request_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM material_requests r WHERE r.id = request_id AND r.lab_id = get_my_lab_id())
  );

-- ─────────────────────────────────────────────────────────────────────────
--  RPC'ler
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: aktör rolünü çöz
CREATE OR REPLACE FUNCTION _resolve_requester_type(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_role TEXT;
BEGIN
  SELECT user_type, role INTO v_type, v_role FROM profiles WHERE id = p_user_id;
  IF v_type = 'lab' AND v_role = 'manager' THEN
    RETURN 'manager';
  ELSIF v_type = 'lab' THEN
    RETURN 'technician';
  ELSIF v_type = 'admin' THEN
    RETURN 'manager';   -- admin yine de manager akışında değerlendirilir
  ELSE
    RETURN 'other';
  END IF;
END;
$$;

-- Yardımcı: lab manager'lara bildirim atar
CREATE OR REPLACE FUNCTION _notify_lab_managers(p_lab_id UUID, p_title TEXT, p_body TEXT, p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  SELECT p.id, p_lab_id, 'material_request', p_title, p_body,
         'material_request', p_request_id,
         '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT,
         jsonb_build_object('request_id', p_request_id)
    FROM profiles p
   WHERE p.user_type = 'lab' AND p.role IN ('manager','admin')
     AND EXISTS (SELECT 1 FROM labs WHERE id = p_lab_id);
END;
$$;

-- Yardımcı: admin'lere bildirim atar
CREATE OR REPLACE FUNCTION _notify_admins(p_lab_id UUID, p_title TEXT, p_body TEXT, p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  SELECT p.id, p_lab_id, 'material_request', p_title, p_body,
         'material_request', p_request_id,
         '/(admin)/stock?tab=material_requests&id=' || p_request_id::TEXT,
         jsonb_build_object('request_id', p_request_id)
    FROM profiles p
   WHERE p.user_type = 'admin';
END;
$$;

-- Yardımcı: belirli kullanıcıya bildirim
CREATE OR REPLACE FUNCTION _notify_user(p_user_id UUID, p_lab_id UUID, p_title TEXT, p_body TEXT, p_request_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  VALUES (p_user_id, p_lab_id, 'material_request', p_title, p_body,
          'material_request', p_request_id, p_url,
          jsonb_build_object('request_id', p_request_id));
END;
$$;

-- ── create_material_request ────────────────────────────────────────────
-- p_items: [{name, category?, unit, quantity, est_unit_cost?, notes?, catalog_id?}, ...]
CREATE OR REPLACE FUNCTION create_material_request(
  p_title       TEXT,
  p_items       JSONB,
  p_reason      TEXT DEFAULT NULL,
  p_urgency     TEXT DEFAULT 'normal',
  p_needed_by   DATE DEFAULT NULL,
  p_attachment  TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_lab_id    UUID := get_my_lab_id();
  v_req_type  TEXT;
  v_status    TEXT;
  v_request_id UUID;
  v_item      JSONB;
  v_idx       INT := 0;
  v_count     INT;
  v_total_est NUMERIC := 0;
  v_user_type TEXT;
  v_role      TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'Lab bilgisi bulunamadı.'; END IF;
  IF p_urgency NOT IN ('low','normal','high','critical') THEN
    RAISE EXCEPTION 'Geçersiz aciliyet.';
  END IF;
  IF p_title IS NULL OR LENGTH(BTRIM(p_title)) = 0 THEN
    RAISE EXCEPTION 'Başlık zorunlu.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'En az bir kalem girilmeli.';
  END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;

  -- Sadece lab paneli kullanıcıları talep açabilir (teknisyen veya manager)
  IF v_user_type <> 'lab' AND v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Talep oluşturma yetkiniz yok.';
  END IF;

  v_req_type := _resolve_requester_type(v_user_id);

  -- Manager kendi açarsa → fast-track: doğrudan admin onayına gider
  IF v_req_type = 'manager' THEN
    v_status := 'forwarded_admin';
  ELSE
    v_status := 'submitted';
  END IF;

  INSERT INTO material_requests (
    lab_id, requester_id, requester_type, title, reason, urgency,
    needed_by, attachment_url, status,
    manager_id, manager_action_at, manager_note
  ) VALUES (
    v_lab_id, v_user_id, v_req_type, BTRIM(p_title), NULLIF(BTRIM(p_reason), ''), p_urgency,
    p_needed_by, NULLIF(BTRIM(p_attachment), ''), v_status,
    CASE WHEN v_status = 'forwarded_admin' THEN v_user_id ELSE NULL END,
    CASE WHEN v_status = 'forwarded_admin' THEN NOW()      ELSE NULL END,
    CASE WHEN v_status = 'forwarded_admin' THEN 'Otomatik yönlendirme (mesul müdür kendi talebi)' ELSE NULL END
  )
  RETURNING id INTO v_request_id;

  -- Kalemler
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    INSERT INTO material_request_items (
      request_id, catalog_id, name, category, unit, quantity, est_unit_cost, notes, sort_order
    ) VALUES (
      v_request_id,
      NULLIF(v_item->>'catalog_id','')::UUID,
      BTRIM(v_item->>'name'),
      NULLIF(v_item->>'category',''),
      COALESCE(NULLIF(v_item->>'unit',''), 'adet'),
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      NULLIF(v_item->>'est_unit_cost','')::NUMERIC,
      NULLIF(v_item->>'notes',''),
      v_idx
    );
    v_total_est := v_total_est + COALESCE((v_item->>'quantity')::NUMERIC, 0)
                                 * COALESCE((v_item->>'est_unit_cost')::NUMERIC, 0);
  END LOOP;

  SELECT COUNT(*) INTO v_count FROM material_request_items WHERE request_id = v_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note, payload)
  VALUES (v_request_id, v_user_id, v_req_type, 'created', NULL,
          jsonb_build_object('item_count', v_count, 'est_total', v_total_est));

  IF v_status = 'forwarded_admin' THEN
    INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
    VALUES (v_request_id, v_user_id, v_req_type, 'auto_forwarded_self', 'Mesul müdür kendi talebi — admin onayına gönderildi');
    PERFORM _notify_admins(v_lab_id,
      'Yeni malzeme talebi (mesul müdür)',
      v_count || ' kalem · ' || p_urgency || ' · ' || BTRIM(p_title),
      v_request_id);
  ELSE
    INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
    VALUES (v_request_id, v_user_id, v_req_type, 'submitted', NULL);
    PERFORM _notify_lab_managers(v_lab_id,
      'Yeni malzeme talebi',
      v_count || ' kalem · ' || p_urgency || ' · ' || BTRIM(p_title),
      v_request_id);
  END IF;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_material_request(TEXT, JSONB, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- ── manager_forward_request ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION manager_forward_request(p_request_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role    TEXT;
  v_type    TEXT;
  v_req     material_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  SELECT user_type, role INTO v_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_type = 'lab' AND v_role IN ('manager','admin')) THEN
    RAISE EXCEPTION 'Bu işlem için mesul müdür yetkisi gerekli.';
  END IF;

  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF v_req.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'Farklı lab.'; END IF;
  IF v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'Sadece bekleyen talepler yönlendirilebilir (durum: %).', v_req.status;
  END IF;

  UPDATE material_requests
     SET status = 'forwarded_admin',
         manager_id = v_user_id,
         manager_action_at = NOW(),
         manager_note = NULLIF(BTRIM(p_note), '')
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
  VALUES (p_request_id, v_user_id, 'manager', 'forwarded', NULLIF(BTRIM(p_note), ''));

  PERFORM _notify_admins(v_req.lab_id,
    'Malzeme talebi admin onayında',
    v_req.title,
    p_request_id);

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Talebiniz admin onayına yönlendirildi',
    v_req.title,
    p_request_id,
    '/(station)/material-requests?id=' || p_request_id::TEXT);
END;
$$;

GRANT EXECUTE ON FUNCTION manager_forward_request(UUID, TEXT) TO authenticated;

-- ── manager_reject_request ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION manager_reject_request(p_request_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role    TEXT;
  v_type    TEXT;
  v_req     material_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  SELECT user_type, role INTO v_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_type = 'lab' AND v_role IN ('manager','admin')) THEN
    RAISE EXCEPTION 'Yetki yok.';
  END IF;
  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Red sebebi zorunlu.';
  END IF;

  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF v_req.lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'Farklı lab.'; END IF;
  IF v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'Sadece bekleyen talep reddedilebilir.';
  END IF;

  UPDATE material_requests
     SET status = 'rejected_manager',
         manager_id = v_user_id,
         manager_action_at = NOW(),
         reject_reason = BTRIM(p_reason)
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
  VALUES (p_request_id, v_user_id, 'manager', 'rejected_manager', BTRIM(p_reason));

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Talebiniz reddedildi',
    BTRIM(p_reason),
    p_request_id,
    '/(station)/material-requests?id=' || p_request_id::TEXT);
END;
$$;

GRANT EXECUTE ON FUNCTION manager_reject_request(UUID, TEXT) TO authenticated;

-- ── admin_approve_request ──────────────────────────────────────────────
-- p_items: [{id, approved_qty, actual_unit_cost?}, ...] (opsiyonel — boş ise mevcutlar kabul edilir)
CREATE OR REPLACE FUNCTION admin_approve_request(
  p_request_id UUID,
  p_items      JSONB DEFAULT NULL,
  p_note       TEXT  DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_type     TEXT;
  v_req      material_requests%ROWTYPE;
  v_item     JSONB;
  v_total    NUMERIC := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  SELECT user_type INTO v_type FROM profiles WHERE id = v_user_id;
  IF v_type <> 'admin' THEN RAISE EXCEPTION 'Admin yetkisi gerekli.'; END IF;

  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF v_req.status <> 'forwarded_admin' THEN
    RAISE EXCEPTION 'Sadece yönlendirilmiş talep onaylanabilir (durum: %).', v_req.status;
  END IF;

  -- Kalem güncellemeleri (opsiyonel)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      UPDATE material_request_items
         SET approved_qty     = COALESCE(NULLIF(v_item->>'approved_qty','')::NUMERIC, approved_qty, quantity),
             actual_unit_cost = COALESCE(NULLIF(v_item->>'actual_unit_cost','')::NUMERIC, actual_unit_cost, est_unit_cost)
       WHERE id = (v_item->>'id')::UUID AND request_id = p_request_id;
    END LOOP;
  ELSE
    UPDATE material_request_items
       SET approved_qty = COALESCE(approved_qty, quantity),
           actual_unit_cost = COALESCE(actual_unit_cost, est_unit_cost)
     WHERE request_id = p_request_id;
  END IF;

  SELECT COALESCE(SUM(COALESCE(approved_qty, quantity) * COALESCE(actual_unit_cost, est_unit_cost, 0)), 0)
    INTO v_total
    FROM material_request_items WHERE request_id = p_request_id;

  UPDATE material_requests
     SET status = 'approved',
         admin_id = v_user_id,
         admin_action_at = NOW(),
         admin_note = NULLIF(BTRIM(p_note), ''),
         total_cost = NULLIF(v_total, 0)
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note, payload)
  VALUES (p_request_id, v_user_id, 'admin', 'approved', NULLIF(BTRIM(p_note), ''),
          jsonb_build_object('total_cost', v_total));

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Talebiniz onaylandı',
    'Satınalma sürecine alındı · ' || v_req.title,
    p_request_id,
    CASE WHEN v_req.requester_type = 'manager'
         THEN '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT
         ELSE '/(station)/material-requests?id=' || p_request_id::TEXT
    END);

  IF v_req.manager_id IS NOT NULL AND v_req.manager_id <> v_req.requester_id THEN
    PERFORM _notify_user(v_req.manager_id, v_req.lab_id,
      'Onayladığınız talep admin tarafından onaylandı',
      v_req.title, p_request_id,
      '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_request(UUID, JSONB, TEXT) TO authenticated;

-- ── admin_reject_request ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reject_request(p_request_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_type    TEXT;
  v_req     material_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  SELECT user_type INTO v_type FROM profiles WHERE id = v_user_id;
  IF v_type <> 'admin' THEN RAISE EXCEPTION 'Admin yetkisi gerekli.'; END IF;
  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Red sebebi zorunlu.';
  END IF;

  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF v_req.status <> 'forwarded_admin' THEN
    RAISE EXCEPTION 'Yalnızca admin onayında bekleyen talep reddedilebilir.';
  END IF;

  UPDATE material_requests
     SET status = 'rejected_admin',
         admin_id = v_user_id,
         admin_action_at = NOW(),
         reject_reason = BTRIM(p_reason)
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
  VALUES (p_request_id, v_user_id, 'admin', 'rejected_admin', BTRIM(p_reason));

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Talebiniz reddedildi',
    BTRIM(p_reason),
    p_request_id,
    CASE WHEN v_req.requester_type = 'manager'
         THEN '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT
         ELSE '/(station)/material-requests?id=' || p_request_id::TEXT
    END);

  IF v_req.manager_id IS NOT NULL AND v_req.manager_id <> v_req.requester_id THEN
    PERFORM _notify_user(v_req.manager_id, v_req.lab_id,
      'Yönlendirdiğiniz talep reddedildi',
      BTRIM(p_reason), p_request_id,
      '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_request(UUID, TEXT) TO authenticated;

-- ── mark_request_ordered / received ──────────────────────────────────
CREATE OR REPLACE FUNCTION mark_request_ordered(
  p_request_id UUID,
  p_supplier_id UUID DEFAULT NULL,
  p_ordered_at  DATE DEFAULT CURRENT_DATE,
  p_expected_at DATE DEFAULT NULL,
  p_total_cost  NUMERIC DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_type    TEXT;
  v_req     material_requests%ROWTYPE;
BEGIN
  SELECT user_type INTO v_type FROM profiles WHERE id = v_user_id;
  IF v_type <> 'admin' THEN RAISE EXCEPTION 'Admin yetkisi.'; END IF;
  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'Sadece onaylı talep siparişe alınabilir.'; END IF;

  UPDATE material_requests
     SET status = 'ordered',
         supplier_id = COALESCE(p_supplier_id, supplier_id),
         ordered_at  = p_ordered_at,
         expected_at = p_expected_at,
         total_cost  = COALESCE(p_total_cost, total_cost)
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, payload)
  VALUES (p_request_id, v_user_id, 'admin', 'ordered',
          jsonb_build_object('supplier_id', p_supplier_id, 'ordered_at', p_ordered_at, 'expected_at', p_expected_at));

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Sipariş verildi',
    'Tahmini teslim: ' || COALESCE(p_expected_at::TEXT, '—'),
    p_request_id,
    CASE WHEN v_req.requester_type = 'manager'
         THEN '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT
         ELSE '/(station)/material-requests?id=' || p_request_id::TEXT
    END);
END;
$$;
GRANT EXECUTE ON FUNCTION mark_request_ordered(UUID, UUID, DATE, DATE, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION mark_request_received(
  p_request_id UUID,
  p_received_at DATE DEFAULT CURRENT_DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_type    TEXT;
  v_req     material_requests%ROWTYPE;
BEGIN
  SELECT user_type INTO v_type FROM profiles WHERE id = v_user_id;
  IF v_type <> 'admin' THEN RAISE EXCEPTION 'Admin yetkisi.'; END IF;
  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF v_req.status NOT IN ('ordered','approved') THEN
    RAISE EXCEPTION 'Sadece siparişi verilmiş/onaylı talep teslim alınabilir.';
  END IF;

  UPDATE material_requests
     SET status = 'received',
         received_at = p_received_at
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, payload)
  VALUES (p_request_id, v_user_id, 'admin', 'received', jsonb_build_object('received_at', p_received_at));

  PERFORM _notify_user(v_req.requester_id, v_req.lab_id,
    'Malzeme teslim alındı',
    v_req.title,
    p_request_id,
    CASE WHEN v_req.requester_type = 'manager'
         THEN '/(lab)/stock?tab=material_requests&id=' || p_request_id::TEXT
         ELSE '/(station)/material-requests?id=' || p_request_id::TEXT
    END);
END;
$$;
GRANT EXECUTE ON FUNCTION mark_request_received(UUID, DATE) TO authenticated;

-- ── cancel_material_request ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_material_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req     material_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  IF v_req.requester_id <> v_user_id THEN
    RAISE EXCEPTION 'Sadece talebi açan iptal edebilir.';
  END IF;
  IF v_req.status NOT IN ('draft','submitted','forwarded_admin') THEN
    RAISE EXCEPTION 'Bu durumda iptal mümkün değil (%).', v_req.status;
  END IF;

  UPDATE material_requests
     SET status = 'cancelled',
         reject_reason = NULLIF(BTRIM(p_reason), '')
   WHERE id = p_request_id;

  INSERT INTO material_request_events (request_id, actor_id, actor_role, action, note)
  VALUES (p_request_id, v_user_id, _resolve_requester_type(v_user_id), 'cancelled', NULLIF(BTRIM(p_reason), ''));
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_material_request(UUID, TEXT) TO authenticated;

COMMENT ON TABLE material_requests IS
  'Teknisyen/mesul müdür → admin malzeme talepleri. 3 kademeli onay zinciri.';
