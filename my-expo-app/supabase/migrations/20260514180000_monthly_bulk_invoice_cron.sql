-- Faz 3 — Aylık otomatik toplu fatura cron'u.
-- Her ayın 1'inde 09:00'da çalışır.
-- monthly_bulk modundaki kliniklerin geçen ayki faturalanmamış teslim edilmiş
-- siparişlerini taslak fatura olarak oluşturur. Müdür sonra onaylar.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ── Wrapper fonksiyon: her klinik için create_bulk_invoice çağır ──
CREATE OR REPLACE FUNCTION public.fn_generate_monthly_invoices()
RETURNS TABLE (clinic_id uuid, invoice_id uuid, work_order_count int, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic   RECORD;
  v_orders   uuid[];
  v_due_days int;
  v_inv_id   uuid;
  v_err      text;
BEGIN
  FOR v_clinic IN
    SELECT c.id, COALESCE(c.default_payment_terms_days, 30) AS due_days
    FROM clinics c
    WHERE c.is_active = TRUE
      AND COALESCE(c.billing_mode, 'monthly_bulk') = 'monthly_bulk'
  LOOP
    -- Bu klinik için faturalanmamış teslim edilmiş siparişleri topla
    SELECT array_agg(work_order_id)
    INTO v_orders
    FROM v_unbilled_work_orders
    WHERE clinic_id = v_clinic.id;

    IF v_orders IS NULL OR array_length(v_orders, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- create_bulk_invoice'i çağır (taslak fatura oluşur)
    BEGIN
      v_inv_id := public.create_bulk_invoice(
        v_clinic.id,
        v_orders,
        v_clinic.due_days,
        format('Aylık toplu fatura — %s', to_char(now() - interval '1 month', 'TMMonth YYYY'))
      );
      v_err := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_inv_id := NULL;
      v_err    := SQLERRM;
    END;

    clinic_id        := v_clinic.id;
    invoice_id       := v_inv_id;
    work_order_count := array_length(v_orders, 1);
    error_msg        := v_err;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_generate_monthly_invoices() TO authenticated;

COMMENT ON FUNCTION public.fn_generate_monthly_invoices IS
  'Aylık toplu fatura cron tetikleyicisi — monthly_bulk modu kliniklere taslak fatura oluşturur.';

-- ── Cron job (her ayın 1'i 09:00 TR saati) ──
-- Eski job varsa kaldır
SELECT cron.unschedule('monthly-bulk-invoices')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-bulk-invoices');

SELECT cron.schedule(
  'monthly-bulk-invoices',
  '0 9 1 * *',  -- 09:00 UTC = 12:00 TR (UTC+3) — minor, yöneticiler sabah görür
  $$SELECT public.fn_generate_monthly_invoices();$$
);
