-- 20260827 — Acil ek ücret trigger'ı kalem indirimini KORUSUN
--
-- Eski davranış: her invoice_items değişiminde "Acil Ek Ücret" satırı DELETE + yeniden
-- INSERT ediliyordu → o satıra girilen indirim (discount_type/discount_value) her seferinde
-- siliniyordu (yeni insert'te indirim yok). Ayrıca id değiştiği için istemci de şaşıyordu.
--
-- Yeni davranış: acil satırı VARSA sadece tutarı/başlığı UPDATE edilir (id sabit, indirim
-- alanlarına dokunulmaz → KORUNUR); yoksa INSERT; gerekmiyorsa DELETE.
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_maintain_urgent_surcharge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_status     TEXT;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_base       NUMERIC;
  v_surcharge  NUMERIC;
  v_acil_id    UUID;
  v_desc       TEXT;
BEGIN
  -- Kendi UPDATE/INSERT/DELETE'imizin tetiklediği yeniden girişleri engelle
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT i.lab_id, i.status INTO v_lab_id, v_status
  FROM invoices i WHERE i.id = v_invoice_id;
  IF v_lab_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_status = 'iptal' THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT EXISTS (
    SELECT 1 FROM work_orders wo
      WHERE wo.id = (SELECT work_order_id FROM invoices WHERE id = v_invoice_id)
        AND wo.is_urgent
    UNION ALL
    SELECT 1 FROM invoice_orders io
      JOIN work_orders wo ON wo.id = io.work_order_id
      WHERE io.invoice_id = v_invoice_id AND wo.is_urgent
  ) INTO v_is_urgent;

  SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
    FROM lab_settings WHERE lab_id = v_lab_id;

  -- Mevcut acil satırının id'sini tut (varsa) — DELETE/INSERT yerine UPDATE için
  SELECT id INTO v_acil_id
    FROM invoice_items
    WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%'
    ORDER BY created_at ASC LIMIT 1;

  -- Olası fazladan (mükerrer) acil satırlarını temizle — yalnız birini koru
  IF v_acil_id IS NOT NULL THEN
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%' AND id <> v_acil_id;
  END IF;

  IF COALESCE(v_is_urgent, false) AND COALESCE(v_rate, 0) > 0 THEN
    -- Baz: acil DIŞINDAKI kalemlerin brütü (kendi üstüne bindirmesin)
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_base
      FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description NOT LIKE 'Acil Ek Ücret (%';

    v_surcharge := ROUND(v_base * v_rate / 100.0, 2);
    v_desc := 'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')';

    IF v_surcharge > 0 THEN
      IF v_acil_id IS NOT NULL THEN
        -- VAR: yalnız tutar/başlık güncellenir → discount_* KORUNUR, id sabit
        UPDATE invoice_items
          SET unit_price = v_surcharge, quantity = 1, description = v_desc
          WHERE id = v_acil_id;
      ELSE
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id, v_desc, 1, v_surcharge,
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    ELSE
      -- surcharge 0 → acil satırı olmamalı
      DELETE FROM invoice_items
        WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
    END IF;
  ELSE
    -- acil değil → acil satırı olmamalı
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
