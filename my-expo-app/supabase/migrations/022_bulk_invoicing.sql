-- ─────────────────────────────────────────────────────────────────────────
--  Migration 022 — Toplu Fatura (Bulk Invoicing)
--
--  Tek klinik için birden fazla teslim edilmiş siparişi tek faturada
--  toplamayı mümkün kılar (aylık fatura workflow'u).
--
--  • invoice_orders        → invoice ↔ work_order M:N junction
--  • v_unbilled_work_orders → henüz faturalanmamış teslim edilmiş siparişler
--  • create_bulk_invoice   → çoklu siparişten tek fatura RPC
--
--  create_invoice_from_order da junction'a kayıt ekleyecek şekilde güncellendi
--  ve eski invoices.work_order_id verisi junction'a backfill edildi.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ invoice_orders (M:N junction) ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_orders (
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  lab_id          UUID REFERENCES labs(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (invoice_id, work_order_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_orders_invoice ON invoice_orders (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_orders_order   ON invoice_orders (work_order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_orders_lab     ON invoice_orders (lab_id);

-- auto_set_lab_id trigger
DROP TRIGGER IF EXISTS auto_set_lab_id_invoice_orders ON invoice_orders;
CREATE TRIGGER auto_set_lab_id_invoice_orders
  BEFORE INSERT ON invoice_orders
  FOR EACH ROW EXECUTE FUNCTION auto_set_lab_id();

-- RLS
ALTER TABLE invoice_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_orders_lab_all ON invoice_orders;
CREATE POLICY invoice_orders_lab_all ON invoice_orders
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_orders TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  Backfill: mevcut invoices.work_order_id değerlerini junction'a taşı
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
SELECT i.id, i.work_order_id, i.lab_id
FROM invoices i
WHERE i.work_order_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
--  Mevcut create_invoice_from_order → junction'a da kayıt eklesin
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

  -- Aynı iş emrinden (invoice_orders üzerinden) daha önce fatura kesilmiş mi?
  SELECT io.invoice_id INTO v_invoice_id
  FROM invoice_orders io
  JOIN invoices i ON i.id = io.invoice_id
  WHERE io.work_order_id = p_work_order_id AND i.status <> 'iptal'
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

  -- Junction'a da ekle
  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

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
--  create_bulk_invoice — birden fazla siparişi tek faturada topla
--
--  Kurallar:
--   • Tüm siparişler aynı klinikten olmalı (doktor farklı olabilir)
--   • İptal edilmemiş bir başka faturaya bağlı olan sipariş atlanır
--   • Fatura'nın doctor_id'si ilk siparişinkinden alınır (ref için)
--   • Birden fazla doktor varsa notes alanına bilgilendirme yazılır
--   • Her siparişin kalemleri, iş emri numarası prefix'iyle eklenir
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_bulk_invoice(
  p_clinic_id      UUID,
  p_work_order_ids UUID[],
  p_due_days       INT DEFAULT 30,
  p_notes          TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_id  UUID;
  v_lab_id      UUID;
  v_doctor_id   UUID;
  v_doctor_count INT;
  v_sort        INT := 0;
  v_wo          RECORD;
  v_first_wo    UUID;
  v_auto_notes  TEXT;
BEGIN
  IF p_work_order_ids IS NULL OR array_length(p_work_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'En az bir sipariş seçmelisiniz';
  END IF;

  -- Aynı lab'a ait olduklarını ve hepsinin aynı klinikte olduğunu doğrula
  SELECT wo.lab_id
    INTO v_lab_id
  FROM work_orders wo
  WHERE wo.id = p_work_order_ids[1];

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'İlk sipariş bulunamadı';
  END IF;

  -- Klinik-sipariş eşleşmesini doğrula
  IF EXISTS (
    SELECT 1 FROM work_orders wo
    LEFT JOIN doctors d ON d.id = wo.doctor_id
    WHERE wo.id = ANY(p_work_order_ids)
      AND (d.clinic_id IS DISTINCT FROM p_clinic_id OR wo.lab_id <> v_lab_id)
  ) THEN
    RAISE EXCEPTION 'Tüm siparişler aynı kliniğe ve laboratuvara ait olmalı';
  END IF;

  -- Faturalanmamış olanları al
  IF NOT EXISTS (
    SELECT 1
    FROM unnest(p_work_order_ids) AS wo_id
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo_id AND inv.status <> 'iptal'
    )
  ) THEN
    RAISE EXCEPTION 'Seçili siparişlerin tümü zaten faturalanmış';
  END IF;

  -- Kaç farklı doktor olduğunu bul (notlar için)
  SELECT COUNT(DISTINCT wo.doctor_id)
    INTO v_doctor_count
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    );

  -- İlk siparişin doktorunu ve id'sini referans olarak kullan
  SELECT wo.doctor_id, wo.id
    INTO v_doctor_id, v_first_wo
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    )
  ORDER BY wo.created_at
  LIMIT 1;

  -- Fatura başlığı
  v_auto_notes := CASE
    WHEN v_doctor_count > 1
    THEN 'Birden fazla hekimin işleri tek faturada birleştirildi. ' || COALESCE(p_notes, '')
    ELSE p_notes
  END;

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, notes, created_by)
  VALUES (v_lab_id, v_doctor_id, p_clinic_id, v_first_wo,
          'taslak', CURRENT_DATE,
          CURRENT_DATE + (p_due_days || ' days')::INTERVAL,
          NULLIF(TRIM(COALESCE(v_auto_notes, '')), ''),
          auth.uid())
  RETURNING id INTO v_invoice_id;

  -- Her sipariş için junction + kalemler
  FOR v_wo IN
    SELECT wo.*
    FROM work_orders wo
    WHERE wo.id = ANY(p_work_order_ids)
      AND NOT EXISTS (
        SELECT 1 FROM invoice_orders io
        JOIN invoices inv ON inv.id = io.invoice_id
        WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
      )
    ORDER BY wo.created_at
  LOOP
    -- Junction
    INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
    VALUES (v_invoice_id, v_wo.id, v_lab_id);

    -- Kalemler (order_items varsa)
    IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.work_order_id = v_wo.id) THEN
      INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
      SELECT
        v_invoice_id,
        oi.id,
        '[' || v_wo.order_number || '] ' || oi.name,
        oi.quantity,
        oi.price,
        v_sort + ROW_NUMBER() OVER (ORDER BY oi.created_at)
      FROM order_items oi
      WHERE oi.work_order_id = v_wo.id;

      SELECT v_sort + COUNT(*) INTO v_sort
      FROM order_items WHERE work_order_id = v_wo.id;
    ELSE
      -- order_items yoksa work_order'dan sentezle
      v_sort := v_sort + 1;
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (
        v_invoice_id,
        '[' || v_wo.order_number || '] ' ||
          COALESCE(v_wo.work_type, 'Laboratuvar hizmeti') ||
          CASE
            WHEN v_wo.tooth_numbers IS NOT NULL AND array_length(v_wo.tooth_numbers, 1) > 0
            THEN ' (Dişler: ' || array_to_string(v_wo.tooth_numbers, ', ') || ')'
            ELSE ''
          END,
        GREATEST(COALESCE(array_length(v_wo.tooth_numbers, 1), 1), 1),
        0,
        v_sort
      );
    END IF;
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_bulk_invoice(UUID, UUID[], INT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  v_unbilled_work_orders — teslim edilmiş + henüz faturalanmamış siparişler
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_unbilled_work_orders AS
SELECT
  wo.id                  AS work_order_id,
  wo.lab_id              AS lab_id,
  wo.order_number        AS order_number,
  wo.patient_name        AS patient_name,
  wo.work_type           AS work_type,
  wo.tooth_numbers       AS tooth_numbers,
  wo.delivery_date       AS delivery_date,
  wo.delivered_at        AS delivered_at,
  wo.created_at          AS created_at,
  d.id                   AS doctor_id,
  d.full_name            AS doctor_name,
  d.clinic_id            AS clinic_id,
  c.name                 AS clinic_name,
  COALESCE(
    (SELECT SUM(oi.quantity * oi.price)
     FROM order_items oi WHERE oi.work_order_id = wo.id),
    0
  )                      AS estimated_total,
  (SELECT COUNT(*) FROM order_items oi WHERE oi.work_order_id = wo.id) AS item_count
FROM work_orders wo
LEFT JOIN doctors d ON d.id = wo.doctor_id
LEFT JOIN clinics c ON c.id = d.clinic_id
WHERE wo.status = 'teslim_edildi'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_orders io
    JOIN invoices inv ON inv.id = io.invoice_id
    WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
  );

GRANT SELECT ON v_unbilled_work_orders TO authenticated;
