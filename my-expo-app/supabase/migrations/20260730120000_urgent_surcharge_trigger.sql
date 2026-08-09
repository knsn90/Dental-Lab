-- ============================================================
-- 20260730 — Acil ek ücretini fatura kalemlerinde OTOMATİK sürdür
--
-- Sorun: urgent_surcharge_rate yalnız create_invoice_from_order /
-- create_draft_invoice_on_delivery içinde, fatura OLUŞTURULURKEN tek sefer
-- uygulanıyordu (ve subtotal=0 ise atlanıyordu). Fatura editöründen kalem
-- eklenince/değişince zam yeniden hesaplanmıyor, hiç eklenmemiş faturalarda da
-- görünmüyordu (örn. teslimde kalem yokken oluşan taslak, sonradan kalem eklenen).
--
-- Çözüm: invoice_items her değiştiğinde (INSERT/UPDATE/DELETE), bağlı iş emri
-- ACİL (is_urgent) ve lab oranı > 0 ise "Acil Ek Ücret (%X)" satırını idempotent
-- olarak yeniden kurar (önce eskiyi sil → kalan kalemlerin toplamına göre yeniden
-- ekle). Böylece oluşturma + editör + doğrudan DB değişikliği HER yerde tutarlı.
--
-- Döngü koruması: trigger kendi DELETE/INSERT'ini yaptığında pg_trigger_depth()>1
-- olur ve erken döner. Toplam-yeniden-hesap trigger'ı (recalc_on_items_change)
-- bizim eklediğimiz satırdan sonra da çalışıp invoices.total'ı günceller.
-- Zam satırı NÖTR (KDV öncesi subtotal × oran) — mevcut RPC'lerle birebir biçim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_maintain_urgent_surcharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_status     TEXT;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_base       NUMERIC;
  v_surcharge  NUMERIC;
BEGIN
  -- Kendi DELETE/INSERT'imizin tetiklediği yeniden girişleri engelle
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT i.lab_id, i.status INTO v_lab_id, v_status
  FROM invoices i WHERE i.id = v_invoice_id;
  IF v_lab_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- İptal faturaya dokunma
  IF v_status = 'iptal' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Bağlı iş emri(leri) acil mi? (tekil work_order_id VEYA invoice_orders — toplu)
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

  -- Mevcut acil ek ücret satır(lar)ını sil (idempotent yeniden hesap)
  DELETE FROM invoice_items
  WHERE invoice_id = v_invoice_id
    AND description LIKE 'Acil Ek Ücret (%';

  IF COALESCE(v_is_urgent, false) AND COALESCE(v_rate, 0) > 0 THEN
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_base
      FROM invoice_items WHERE invoice_id = v_invoice_id;
    IF v_base > 0 THEN
      v_surcharge := ROUND(v_base * v_rate / 100.0, 2);
      IF v_surcharge > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1, v_surcharge,
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS maintain_urgent_surcharge ON public.invoice_items;
CREATE TRIGGER maintain_urgent_surcharge
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_maintain_urgent_surcharge();
