-- Klinikte duran kullanılmamış alacağı açık faturalara uygular.
--
-- BİLEREK ELLE: fatura kesme akışına trigger takılmadı. Bakiye zaten alacağı
-- düştüğü için rakam iki türlü de aynı; otomatik uygulama fatura kesmeye
-- görünmez bir yan etki ekler.

CREATE OR REPLACE FUNCTION public.apply_clinic_credit(
  p_clinic_id  uuid,
  p_receipt_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lab     uuid;
  v_r       RECORD;
  v_credit  numeric;
  v_applied numeric;
  v_total   numeric := 0;
  v_count   int := 0;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  FOR v_r IN
    SELECT id, receipt_date, payment_method, base_currency,
           total_base - allocated_base AS credit
      FROM clinic_receipts
     WHERE clinic_id = p_clinic_id
       AND total_base > allocated_base
       AND (p_receipt_id IS NULL OR id = p_receipt_id)
     ORDER BY receipt_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    v_credit := v_r.credit;
    CONTINUE WHEN v_credit <= 0;
    v_applied := alloc_receipt_to_invoices(v_r.id, p_clinic_id, v_credit,
                                           v_r.base_currency, CURRENT_DATE,
                                           v_r.payment_method);
    IF v_applied > 0 THEN
      UPDATE clinic_receipts
         SET allocated_base = allocated_base + v_applied, updated_at = now()
       WHERE id = v_r.id;
      v_total := v_total + v_applied;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied_base', v_total, 'receipts_touched', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.apply_clinic_credit(uuid, uuid) TO authenticated;
