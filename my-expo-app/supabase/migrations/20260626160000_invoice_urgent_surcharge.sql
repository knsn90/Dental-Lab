-- ============================================================
-- 20260626 — Acil ek ücretini faturaya uygula (F3b)
--
-- lab_settings.urgent_surcharge_rate saklanıyor ama hiçbir yerde uygulanmıyordu
-- (sadece NewOrderScreen'de "+%X ek ücret" olarak gösteriliyordu).
-- Bu güncelleme: create_invoice_from_order, iş emri ACİL (is_urgent) ise faturaya
-- şeffaf bir "Acil Ek Ücret (%X)" satırı ekler (subtotal × rate). Fatura toplamı
-- trigger ile yeniden hesaplanır → ek ücret toplama yansır.
-- Diğer mantık (item kopyalama, mükerrer-fatura koruması) aynen korunur. Idempotent.
-- ============================================================
CREATE OR REPLACE FUNCTION create_invoice_from_order(p_work_order_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id, wo.is_urgent
    INTO v_lab_id, v_doctor_id, v_clinic_id, v_is_urgent
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

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

  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

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

  -- ── ACİL EK ÜCRET ── iş emri acilse + lab oranı > 0 → şeffaf bir satır ekle
  IF v_is_urgent THEN
    SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
      FROM lab_settings WHERE lab_id = v_lab_id;
    IF v_rate > 0 THEN
      SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
        FROM invoice_items WHERE invoice_id = v_invoice_id;
      IF v_subtotal > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1,
                ROUND(v_subtotal * v_rate / 100.0, 2),
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;
