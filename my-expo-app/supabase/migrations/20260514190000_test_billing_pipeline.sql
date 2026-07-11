-- Faz 1/2/3 end-to-end test — RAISE NOTICE ile çıktıları yazdır, kalıcı değişiklik yok.
DO $$
DECLARE
  v_lab_id   uuid;
  v_clinic   RECORD;
  v_svc      RECORD;
  v_price    RECORD;
  v_cron     RECORD;
  v_unbilled int;
  v_clinics  int;
BEGIN
  -- 1. Lab + sample klinik bul
  SELECT id INTO v_lab_id FROM labs LIMIT 1;
  RAISE NOTICE '── lab_id: %', v_lab_id;

  -- 2. Klinik billing settings var mı?
  FOR v_clinic IN
    SELECT id, name, billing_mode, default_payment_terms_days
    FROM clinics
    WHERE is_active = TRUE
    LIMIT 3
  LOOP
    RAISE NOTICE '── clinic % | mode=% | due=%g', v_clinic.name, v_clinic.billing_mode, v_clinic.default_payment_terms_days;
  END LOOP;

  -- 3. resolve_item_price test (varsa ilk service)
  SELECT id, name, price INTO v_svc FROM lab_services WHERE lab_id = v_lab_id AND is_active = TRUE LIMIT 1;
  IF v_svc.id IS NOT NULL THEN
    FOR v_price IN
      SELECT * FROM resolve_item_price(v_lab_id, v_svc.id, NULL, CURRENT_DATE)
    LOOP
      RAISE NOTICE '── resolve(% / %): price=%g, source=%, currency=%',
        v_svc.name, v_svc.price, v_price.price, v_price.source, v_price.currency;
    END LOOP;
  ELSE
    RAISE NOTICE '── lab_services boş — resolve test skip';
  END IF;

  -- 4. Faturalanmamış sipariş sayımı (dashboard kartı için)
  SELECT COUNT(*), COUNT(DISTINCT clinic_id) INTO v_unbilled, v_clinics
  FROM v_unbilled_work_orders;
  RAISE NOTICE '── unbilled: % sipariş / % klinik', v_unbilled, v_clinics;

  -- 5. pg_cron job kayıtlı mı?
  FOR v_cron IN
    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'monthly-bulk-invoices'
  LOOP
    RAISE NOTICE '── cron job %: schedule=% active=%', v_cron.jobname, v_cron.schedule, v_cron.active;
  END LOOP;

  -- 6. fn_generate_monthly_invoices fonksiyonu var mı?
  PERFORM 1 FROM pg_proc WHERE proname = 'fn_generate_monthly_invoices';
  IF FOUND THEN
    RAISE NOTICE '── fn_generate_monthly_invoices: OK (exists)';
  ELSE
    RAISE NOTICE '── fn_generate_monthly_invoices: MISSING';
  END IF;

  -- 7. order_items.price_was_overridden kolonu
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_items' AND column_name='price_was_overridden';
  IF FOUND THEN
    RAISE NOTICE '── order_items.price_was_overridden: OK';
  ELSE
    RAISE NOTICE '── order_items.price_was_overridden: MISSING';
  END IF;

  -- 8. clinics.billing_mode kolonu
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='clinics' AND column_name='billing_mode';
  IF FOUND THEN
    RAISE NOTICE '── clinics.billing_mode: OK';
  ELSE
    RAISE NOTICE '── clinics.billing_mode: MISSING';
  END IF;

  RAISE NOTICE '── tüm test pipeline tamam';
END $$;
