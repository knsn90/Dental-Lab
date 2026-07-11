-- TEST migration — RPC'yi sample data ile çalıştır, hataları NOTICE olarak yazdır.
-- Sonunda SAVEPOINT/ROLLBACK ile veriyi geri al. Migration kalıcı değişiklik yapmaz.

DO $$
DECLARE
  v_lab_id uuid;
  v_invoice_id uuid;
  v_err_msg text;
  v_err_detail text;
  v_err_context text;
BEGIN
  -- Bir lab_id bul
  SELECT id INTO v_lab_id FROM public.labs LIMIT 1;
  IF v_lab_id IS NULL THEN
    RAISE NOTICE 'No labs found, skipping test';
    RETURN;
  END IF;

  RAISE NOTICE 'TEST lab_id: %', v_lab_id;

  -- Savepoint ile rollback edebilelim
  BEGIN
    v_invoice_id := public.create_purchase_invoice(
      v_lab_id,
      NULL,  -- supplier_id (yeni oluşacak)
      'TEST OCR SUPPLIER',
      'TEST-001',
      CURRENT_DATE,
      NULL,
      'TRY',
      20,
      'open_account',
      NULL,
      'test notes',
      '[{"item_name":"Test Item","quantity":2,"unit":"adet","unit_price":100}]'::jsonb
    );
    RAISE NOTICE 'RPC SUCCESS — invoice_id: %', v_invoice_id;
    -- Geri al
    DELETE FROM public.purchase_invoices WHERE id = v_invoice_id;
    RAISE NOTICE 'Test data deleted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_msg = MESSAGE_TEXT,
      v_err_detail = PG_EXCEPTION_DETAIL,
      v_err_context = PG_EXCEPTION_CONTEXT;
    RAISE NOTICE 'RPC ERROR: %', v_err_msg;
    RAISE NOTICE 'DETAIL: %', v_err_detail;
    RAISE NOTICE 'CONTEXT: %', v_err_context;
  END;
END $$;
