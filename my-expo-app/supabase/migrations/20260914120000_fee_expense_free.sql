-- 20260914120000_fee_expense_free.sql
--
-- Serbest gönderinin kurye ücreti de gidere düşsün.
--
-- Tetikleyici lab_id'yi SİPARİŞTEN okuyordu; siparişsiz kayıtta v_lab NULL
-- kalıyor ve fonksiyon sessizce çıkıyordu → ücret girilse bile hiç gider
-- oluşmuyordu. Üç değişiklik: lab fallback, yön etiketleri, referans no.
-- Gerisi (kur anlık görüntüsü, ON CONFLICT, iptal/sıfırda gideri silme) aynen.

CREATE OR REPLACE FUNCTION public.trg_delivery_fee_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab      uuid;
  v_order_no text;
  v_ccy      text;
  v_rate     numeric := 1;
  v_base     text;
  v_amt_base numeric;
  v_desc     text;
  v_purpose  text;
  v_yon      text;
  v_who      text;
  v_date     date;
BEGIN
  -- Ucret yok / sifir / iptal edilmis teslimat -> bagli gideri kaldir
  IF NEW.fee_amount IS NULL OR NEW.fee_amount <= 0 OR NEW.status = 'iptal' THEN
    DELETE FROM public.expenses WHERE delivery_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT w.lab_id, w.order_number INTO v_lab, v_order_no
    FROM public.work_orders w WHERE w.id = NEW.work_order_id;
  -- Serbest gönderide sipariş yok: kaydın kendi labı.
  v_lab := COALESCE(v_lab, NEW.lab_id);
  IF v_lab IS NULL THEN RETURN NEW; END IF;

  v_ccy  := COALESCE(NEW.fee_currency, 'TRY');
  v_date := COALESCE(NEW.delivered_at::date, NEW.created_at::date, CURRENT_DATE);

  -- Cok-dovizli: kayit kendi para biriminde tutulur, turetilmis alanlar
  -- uygulamadaki createExpense ile ayni sekilde doldurulur.
  BEGIN
    SELECT s.rate, s.base_currency INTO v_rate, v_base
      FROM public.get_snapshot_rate(v_lab, v_ccy, v_date) s LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_rate := NULL; END;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1; END IF;
  v_base := COALESCE(v_base, 'TRY');
  v_amt_base := NEW.fee_amount * v_rate;

  v_purpose := CASE COALESCE(NEW.purpose, 'teslimat')
    WHEN 'teslimat'     THEN 'Teslimat'
    WHEN 'model_alma'   THEN 'Model alma'
    WHEN 'eksik_parca'  THEN 'Eksik parça'
    WHEN 'prova_gidis'  THEN 'Prova gidiş'
    WHEN 'prova_donus'  THEN 'Prova dönüş'
    WHEN 'iade'         THEN 'İade'
    ELSE 'Diğer' END;

  v_yon := CASE NEW.direction
             WHEN 'clinic_to_lab' THEN 'Klinik → Lab'
             WHEN 'lab_to_other'  THEN 'Lab → Dış'
             WHEN 'other_to_lab'  THEN 'Dış → Lab'
             ELSE 'Lab → Klinik' END;

  v_who := CASE WHEN NEW.mode = 'external'
                THEN COALESCE(NEW.external_provider, 'Dış kargo')
                ELSE 'Kendi kuryemiz' END;

  -- Referans: sipariş no yoksa gönderi no (serbest gönderi).
  v_desc := 'Kurye · ' || v_purpose || ' · ' || v_yon
            || ' · #' || COALESCE(v_order_no, NEW.shipment_no, '?')
            || ' · ' || v_who;

  INSERT INTO public.expenses (
    lab_id, category, description, amount, expense_date, payment_method,
    currency, rate_at_time, amount_base, base_currency_at_time,
    delivery_id, notes
  ) VALUES (
    v_lab, 'kurye', v_desc, NEW.fee_amount, v_date, 'nakit',
    v_ccy, v_rate, v_amt_base, v_base,
    NEW.id,
    CASE WHEN NEW.external_tracking_no IS NOT NULL
         THEN 'Takip no: ' || NEW.external_tracking_no ELSE NULL END
  )
  ON CONFLICT (delivery_id) WHERE delivery_id IS NOT NULL
  DO UPDATE SET
    description           = EXCLUDED.description,
    amount                = EXCLUDED.amount,
    expense_date          = EXCLUDED.expense_date,
    currency              = EXCLUDED.currency,
    rate_at_time          = EXCLUDED.rate_at_time,
    amount_base           = EXCLUDED.amount_base,
    base_currency_at_time = EXCLUDED.base_currency_at_time,
    notes                 = EXCLUDED.notes,
    updated_at            = now();

  RETURN NEW;
END;
$function$;
