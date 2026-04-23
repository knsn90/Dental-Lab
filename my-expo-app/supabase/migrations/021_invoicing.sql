-- ─────────────────────────────────────────────────────────────────────────
--  Migration 021 — Fatura / Tahsilat Modülü
--  • invoices          → fatura başlığı
--  • invoice_items     → fatura kalemleri
--  • payments          → tahsilat kayıtları
--  • v_clinic_balance  → klinik bazlı cari özet
--
--  Her şey lab_id-aware (multi-tenancy), auto_set_lab_id trigger'lı,
--  RLS policy'li. Fatura numarası FTR-YYYY-NNNNN formatında lab bazında
--  artar. Tahsilat girildiğinde paid_amount + status otomatik güncellenir.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ invoices ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        REFERENCES labs(id) ON DELETE CASCADE,
  invoice_number  TEXT        NOT NULL,
  doctor_id       UUID        REFERENCES doctors(id) ON DELETE SET NULL,
  clinic_id       UUID        REFERENCES clinics(id) ON DELETE SET NULL,
  work_order_id   UUID        REFERENCES work_orders(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'taslak'
                  CHECK (status IN ('taslak','kesildi','kismi_odendi','odendi','iptal')),
  issue_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 20 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  currency        TEXT        NOT NULL DEFAULT 'TRY',
  notes           TEXT,
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lab_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_lab         ON invoices (lab_id);
CREATE INDEX IF NOT EXISTS idx_invoices_doctor      ON invoices (doctor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_clinic      ON invoices (clinic_id);
CREATE INDEX IF NOT EXISTS idx_invoices_work_order  ON invoices (work_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date  ON invoices (issue_date DESC);

-- ═══ invoice_items ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_item_id   UUID        REFERENCES order_items(id) ON DELETE SET NULL,
  description     TEXT        NOT NULL,
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total           NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

-- ═══ payments ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID        REFERENCES labs(id) ON DELETE CASCADE,
  invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT        NOT NULL DEFAULT 'nakit'
                  CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  reference_no    TEXT,
  notes           TEXT,
  received_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_lab      ON payments (lab_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON payments (payment_date DESC);

-- ─────────────────────────────────────────────────────────────────────────
--  auto_set_lab_id trigger (mevcut 012'deki helper fonksiyonu kullanır)
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS auto_set_lab_id_invoices ON invoices;
CREATE TRIGGER auto_set_lab_id_invoices
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

DROP TRIGGER IF EXISTS auto_set_lab_id_payments ON payments;
CREATE TRIGGER auto_set_lab_id_payments
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

-- updated_at otomatik güncellensin
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS touch_invoices_updated_at ON invoices;
CREATE TRIGGER touch_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
--  Fatura numarası üretimi: FTR-YYYY-NNNNN (lab bazında yıl içinde artar)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_invoice_number(p_lab_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
  v_max  INT;
  v_next TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ ('^FTR-' || v_year || '-[0-9]+$')
      THEN split_part(invoice_number, '-', 3)::INT
      ELSE 0
    END
  ), 0) INTO v_max
  FROM invoices
  WHERE lab_id = p_lab_id;

  v_next := 'FTR-' || v_year || '-' || lpad((v_max + 1)::TEXT, 5, '0');
  RETURN v_next;
END;
$$;

-- Insert sırasında invoice_number boşsa otomatik üret
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := next_invoice_number(NEW.lab_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
CREATE TRIGGER set_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();

-- ─────────────────────────────────────────────────────────────────────────
--  subtotal/tax_amount/total — invoice_items'tan otomatik hesaplansın
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recalc_invoice_totals(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(5,2);
  v_tax      NUMERIC(12,2);
  v_total    NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id;

  SELECT tax_rate INTO v_tax_rate FROM invoices WHERE id = p_invoice_id;
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_tax   := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  UPDATE invoices
  SET subtotal = v_subtotal,
      tax_amount = v_tax,
      total = v_total
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_invoice_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_invoice_totals(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM recalc_invoice_totals(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recalc_on_items_change ON invoice_items;
CREATE TRIGGER recalc_on_items_change
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_invoice_totals();

-- Tax rate değişirse de total'ı güncelle
CREATE OR REPLACE FUNCTION trg_recalc_on_tax_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tax_rate IS DISTINCT FROM OLD.tax_rate THEN
    PERFORM recalc_invoice_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_on_tax_change ON invoices;
CREATE TRIGGER recalc_on_tax_change
  AFTER UPDATE OF tax_rate ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_on_tax_change();

-- ─────────────────────────────────────────────────────────────────────────
--  paid_amount + status — payments insert/update/delete ile senkronize
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recalc_invoice_payment_state(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_paid   NUMERIC(12,2);
  v_total  NUMERIC(12,2);
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payments WHERE invoice_id = p_invoice_id;

  SELECT total, status INTO v_total, v_status
  FROM invoices WHERE id = p_invoice_id;

  -- iptal edilmiş faturanın status'unu değiştirme
  IF v_status = 'iptal' THEN
    UPDATE invoices SET paid_amount = v_paid WHERE id = p_invoice_id;
    RETURN;
  END IF;

  UPDATE invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_paid >= v_total AND v_total > 0 THEN 'odendi'
        WHEN v_paid > 0 AND v_paid < v_total   THEN 'kismi_odendi'
        WHEN v_paid = 0 AND status IN ('kismi_odendi','odendi') THEN 'kesildi'
        ELSE status
      END
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_payment_state()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_invoice_payment_state(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM recalc_invoice_payment_state(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recalc_on_payment_change ON payments;
CREATE TRIGGER recalc_on_payment_change
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_payment_state();

-- ─────────────────────────────────────────────────────────────────────────
--  Sipariş teslim edildiğinde fatura taslağı otomatik oluşsun (opsiyonel)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_invoice_from_order(p_work_order_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id
    INTO v_lab_id, v_doctor_id, v_clinic_id
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

  -- Aynı iş emrinden daha önce fatura kesilmiş mi?
  SELECT id INTO v_invoice_id
  FROM invoices
  WHERE work_order_id = p_work_order_id AND status <> 'iptal'
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  v_due_date := CURRENT_DATE + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', CURRENT_DATE, v_due_date, auth.uid())
  RETURNING id INTO v_invoice_id;

  -- order_items → invoice_items kopyala
  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

  -- İlk order_items boşsa work_order'ın kendisinden bir kalem üret
  IF NOT EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_invoice_id) THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    SELECT v_invoice_id,
           COALESCE(work_type, 'Laboratuvar hizmeti') ||
             CASE
               WHEN tooth_numbers IS NOT NULL AND array_length(tooth_numbers, 1) > 0
               THEN ' (Dişler: ' || array_to_string(tooth_numbers, ', ') || ')'
               ELSE ''
             END,
           GREATEST(COALESCE(array_length(tooth_numbers, 1), 1), 1),
           0,
           1
    FROM work_orders WHERE id = p_work_order_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
--  v_clinic_balance — klinik bazlı cari özet
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_clinic_balance AS
SELECT
  c.id              AS clinic_id,
  c.name            AS clinic_name,
  i.lab_id          AS lab_id,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status <> 'iptal')                    AS invoice_count,
  COALESCE(SUM(i.total)       FILTER (WHERE i.status <> 'iptal'), 0)         AS total_billed,
  COALESCE(SUM(i.paid_amount) FILTER (WHERE i.status <> 'iptal'), 0)         AS total_paid,
  COALESCE(SUM(i.total - i.paid_amount) FILTER (WHERE i.status <> 'iptal'), 0) AS balance,
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.due_date < CURRENT_DATE
      AND i.paid_amount < i.total
  ), 0) AS overdue_amount,
  MIN(i.due_date) FILTER (
    WHERE i.status <> 'iptal'
      AND i.due_date < CURRENT_DATE
      AND i.paid_amount < i.total
  ) AS oldest_overdue_date
FROM clinics c
LEFT JOIN invoices i ON i.clinic_id = c.id
GROUP BY c.id, c.name, i.lab_id;

-- ═══ RLS ═════════════════════════════════════════════════════════════════
ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;

-- invoices — lab üyeleri kendi lab'ının faturalarını görebilir/yönetebilir
DROP POLICY IF EXISTS invoices_lab_select ON invoices;
CREATE POLICY invoices_lab_select ON invoices
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS invoices_lab_insert ON invoices;
CREATE POLICY invoices_lab_insert ON invoices
  FOR INSERT WITH CHECK (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS invoices_lab_update ON invoices;
CREATE POLICY invoices_lab_update ON invoices
  FOR UPDATE USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS invoices_lab_delete ON invoices;
CREATE POLICY invoices_lab_delete ON invoices
  FOR DELETE USING (lab_id = get_my_lab_id());

-- NOTE: Doktor panel için doctors.profile_id eklendiğinde doctor_select
-- policy'leri 022_doctor_portal migration'ında açılacak. Şimdilik yalnızca
-- lab üyeleri (tek tenant'taki lab) faturaları görür.

-- invoice_items — bağlı fatura lab match ile
DROP POLICY IF EXISTS invoice_items_lab_all ON invoice_items;
CREATE POLICY invoice_items_lab_all ON invoice_items
  FOR ALL USING (
    invoice_id IN (SELECT id FROM invoices WHERE lab_id = get_my_lab_id())
  )
  WITH CHECK (
    invoice_id IN (SELECT id FROM invoices WHERE lab_id = get_my_lab_id())
  );

-- payments — lab üyeleri yönetir
DROP POLICY IF EXISTS payments_lab_select ON payments;
CREATE POLICY payments_lab_select ON payments
  FOR SELECT USING (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS payments_lab_insert ON payments;
CREATE POLICY payments_lab_insert ON payments
  FOR INSERT WITH CHECK (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS payments_lab_update ON payments;
CREATE POLICY payments_lab_update ON payments
  FOR UPDATE USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

DROP POLICY IF EXISTS payments_lab_delete ON payments;
CREATE POLICY payments_lab_delete ON payments
  FOR DELETE USING (lab_id = get_my_lab_id());

-- ═══ Yetkiler ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments      TO authenticated;
GRANT SELECT ON v_clinic_balance TO authenticated;
GRANT EXECUTE ON FUNCTION next_invoice_number(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION create_invoice_from_order(UUID)   TO authenticated;
