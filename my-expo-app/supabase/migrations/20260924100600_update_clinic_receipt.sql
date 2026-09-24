-- Tahsilat fişini düzeltme.
--
-- Satırlar TAMAMEN değiştirilir (sil + yeniden yaz): kullanıcı pencerede
-- satır ekleyip silebildiği için kısmi güncelleme iki tarafı ayrıştırırdı.
--
-- Faturaya DAĞITILMIŞ fiş düzenlenemez: tutarı değiştirmek faturalardaki
-- ödeme satırlarını tutarsız bırakırdı. Böyle bir fiş varsa önce alacağı
-- geri almak gerekir (bugünden sonra üretilmiyor; eski kayıtlar için kapı).

CREATE OR REPLACE FUNCTION public.update_clinic_receipt(
  p_receipt_id      uuid,
  p_lines           jsonb,
  p_receipt_date    date    DEFAULT NULL,
  p_payment_method  text    DEFAULT NULL,
  p_reference_no    text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_r     RECORD;
  v_total numeric;
  v_l     jsonb;
BEGIN
  SELECT r.id, r.lab_id, r.clinic_id, r.allocated_base, r.base_currency,
         r.receipt_date, r.payment_method
    INTO v_r
    FROM clinic_receipts r WHERE r.id = p_receipt_id
    FOR UPDATE;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'Tahsilat bulunamadı'; END IF;

  IF NOT (is_platform_admin()
          OR (v_r.lab_id = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  IF v_r.allocated_base > 0 THEN
    RAISE EXCEPTION 'Faturalara dağıtılmış tahsilat düzenlenemez';
  END IF;

  v_total := receipt_lines_total_base(p_lines);

  DELETE FROM clinic_receipt_lines WHERE receipt_id = p_receipt_id;
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
    VALUES (p_receipt_id, v_l->>'currency', (v_l->>'amount')::numeric,
            (v_l->>'rate')::numeric,
            round((v_l->>'amount')::numeric * (v_l->>'rate')::numeric, 2));
  END LOOP;

  UPDATE clinic_receipts
     SET total_base     = v_total,
         receipt_date   = COALESCE(p_receipt_date, receipt_date),
         payment_method = COALESCE(p_payment_method, payment_method),
         reference_no   = p_reference_no,
         notes          = p_notes,
         updated_at     = now()
   WHERE id = p_receipt_id;

  RETURN jsonb_build_object(
    'receipt_id', p_receipt_id,
    'total_base', v_total,
    'allocated_base', 0,
    'credit_base', v_total,
    'allocations', '[]'::jsonb);
END $$;

-- Fişi silme (yanlış girilen kayıt için). Dağıtılmışsa yine kapalı.
CREATE OR REPLACE FUNCTION public.delete_clinic_receipt(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lab uuid; v_alloc numeric;
BEGIN
  SELECT lab_id, allocated_base INTO v_lab, v_alloc
    FROM clinic_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Tahsilat bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;
  IF v_alloc > 0 THEN
    RAISE EXCEPTION 'Faturalara dağıtılmış tahsilat silinemez';
  END IF;
  DELETE FROM clinic_receipts WHERE id = p_receipt_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_clinic_receipt(uuid, jsonb, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clinic_receipt(uuid) TO authenticated;
