-- ═══════════════════════════════════════════════════════════════════════════
-- Teslimde otomatik taslak fatura + fatura RPC'lerinde para birimi düzeltmesi
--
-- 1) create_invoice_from_order / create_bulk_invoice `currency` alanını HİÇ
--    set etmiyordu → invoices.currency DEFAULT 'TRY' devreye giriyor ve EUR
--    kalemlerden ₺ fatura üretiliyordu. Artık para birimi order_items'ın
--    baskın dövizinden alınır (yoksa lab_settings.default_currency).
--    Kur (rate_at_time) zaten set_invoice_amount_base trigger'ı tarafından
--    çözülüyor — ona dokunulmuyor.
--
-- 2) İş 'teslim_edildi'ye geçtiğinde otomatik TASLAK fatura üretilir. Taslak
--    v_clinic_balance'a dahil DEĞİL (view zaten 'taslak' hariç tutuyor), yani
--    cari bakiye etkilenmez. Kullanıcı taslağı kontrol edip keser.
--    Tetikleyici hiçbir koşulda teslimatı bloklamaz (EXCEPTION → WARNING).
--
-- Geriye dönük toplu taslak üretimi YAPILMAZ — mevcut faturasız teslim işler
-- ekstredeki "Faturalanmamış İşler" bölümünde durur, tıklanınca taslağa döner.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. Tek siparişten fatura ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_work_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
  v_base       TEXT;
  v_currency   TEXT;
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

  -- ── PARA BİRİMİ ── kalemlerin baskın dövizi (tutar ağırlıklı), yoksa baz
  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  v_due_date := CURRENT_DATE + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', CURRENT_DATE, v_due_date, v_currency, auth.uid())
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

-- ── 1b. Toplu fatura ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_bulk_invoice(
  p_clinic_id      UUID,
  p_work_order_ids UUID[],
  p_due_days       INTEGER DEFAULT 30,
  p_notes          TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id   UUID;
  v_lab_id       UUID;
  v_doctor_id    UUID;
  v_doctor_count INT;
  v_sort         INT := 0;
  v_wo           RECORD;
  v_first_wo     UUID;
  v_auto_notes   TEXT;
  v_base         TEXT;
  v_currency     TEXT;
  v_ccy_count    INT;
BEGIN
  IF p_work_order_ids IS NULL OR array_length(p_work_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'En az bir sipariş seçmelisiniz';
  END IF;

  SELECT wo.lab_id
    INTO v_lab_id
  FROM work_orders wo
  WHERE wo.id = p_work_order_ids[1];

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'İlk sipariş bulunamadı';
  END IF;

  IF EXISTS (
    SELECT 1 FROM work_orders wo
    LEFT JOIN doctors d ON d.id = wo.doctor_id
    WHERE wo.id = ANY(p_work_order_ids)
      AND (d.clinic_id IS DISTINCT FROM p_clinic_id OR wo.lab_id <> v_lab_id)
  ) THEN
    RAISE EXCEPTION 'Tüm siparişler aynı kliniğe ve laboratuvara ait olmalı';
  END IF;

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

  -- ── PARA BİRİMİ ── tek faturada tek döviz olabilir; karışıksa net hata ver
  -- (eskiden sessizce ₺ fatura üretiliyordu — yanlış tutar üretmektense durur).
  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COUNT(DISTINCT COALESCE(oi.currency, v_base))
    INTO v_ccy_count
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids);

  IF v_ccy_count > 1 THEN
    RAISE EXCEPTION 'Seçili siparişler farklı para birimlerinde — tek faturada birleştirilemez. Lütfen aynı para birimindekileri ayrı ayrı faturalayın.';
  END IF;

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids)
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  SELECT COUNT(DISTINCT wo.doctor_id)
    INTO v_doctor_count
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    );

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

  v_auto_notes := CASE
    WHEN v_doctor_count > 1
    THEN 'Birden fazla hekimin işleri tek faturada birleştirildi. ' || COALESCE(p_notes, '')
    ELSE p_notes
  END;

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, notes, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, p_clinic_id, v_first_wo,
          'taslak', CURRENT_DATE,
          CURRENT_DATE + (p_due_days || ' days')::INTERVAL,
          NULLIF(TRIM(COALESCE(v_auto_notes, '')), ''),
          v_currency,
          auth.uid())
  RETURNING id INTO v_invoice_id;

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
    INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
    VALUES (v_invoice_id, v_wo.id, v_lab_id);

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

-- ── 2. Teslimde otomatik taslak fatura ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_auto_draft_invoice_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'teslim_edildi'::work_order_status
     AND OLD.status IS DISTINCT FROM 'teslim_edildi'::work_order_status THEN
    BEGIN
      PERFORM public.create_invoice_from_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Fatura taslağı ASLA teslimatı bloklamaz.
      RAISE WARNING 'auto draft invoice failed (work_order %): %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_auto_draft_invoice ON public.work_orders;
CREATE TRIGGER work_orders_auto_draft_invoice
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_draft_invoice_on_delivery();
