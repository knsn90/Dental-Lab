-- 20261127120000_delivery_other_to_other.sql geri alma
-- ÖNCE other_to_other satırı varsa yönünü değiştir/sil, sonra çalıştır.
BEGIN;
DROP FUNCTION IF EXISTS public.create_delivery(uuid,text,uuid,text,text,text,text,text,numeric,text,text,text,text,text,text,numeric,numeric,text,text,text,numeric,numeric);
CREATE OR REPLACE FUNCTION public.create_delivery(p_work_order_id uuid, p_mode text, p_courier_id uuid DEFAULT NULL::uuid, p_external_provider text DEFAULT NULL::text, p_external_tracking_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_purpose text DEFAULT 'teslimat'::text, p_direction text DEFAULT 'lab_to_clinic'::text, p_fee_amount numeric DEFAULT NULL::numeric, p_fee_currency text DEFAULT NULL::text, p_fee_source text DEFAULT NULL::text, p_stage_snapshot text DEFAULT NULL::text, p_party_name text DEFAULT NULL::text, p_party_address text DEFAULT NULL::text, p_party_phone text DEFAULT NULL::text, p_party_lat numeric DEFAULT NULL::numeric, p_party_lng numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_currency  TEXT;
  v_id        UUID;
  v_cli_name  TEXT; v_cli_addr TEXT; v_cli_phone TEXT;
  v_lab_name  TEXT; v_lab_addr TEXT; v_lab_phone TEXT;
  v_lab_lat   NUMERIC; v_lab_lng NUMERIC;
  v_incoming  BOOLEAN;
  v_dest_name TEXT; v_dest_addr TEXT; v_dest_phone TEXT;
  v_dest_lat  NUMERIC; v_dest_lng NUMERIC;
  v_org_name  TEXT; v_org_addr TEXT;
  v_org_lat   NUMERIC; v_org_lng NUMERIC;
  v_free      BOOLEAN := (p_work_order_id IS NULL);
  v_year      INTEGER := EXTRACT(YEAR FROM NOW())::int;
  v_no        INTEGER;
  v_ship_no   TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_mode = 'internal' AND p_courier_id IS NULL THEN
    RAISE EXCEPTION 'internal mode requires courier_id';
  END IF;
  IF p_mode = 'external' AND p_external_tracking_no IS NULL AND p_external_provider IS NULL THEN
    RAISE EXCEPTION 'external mode requires provider or tracking no';
  END IF;

  -- Serbest gönderide alıcı/gönderen sunucuda türetilemez; çağıran vermeli.
  IF v_free THEN
    IF COALESCE(TRIM(p_party_name), '') = '' OR COALESCE(TRIM(p_party_address), '') = '' THEN
      RAISE EXCEPTION 'serbest gönderide karşı taraf adı ve adresi zorunlu';
    END IF;
    IF COALESCE(p_direction, '') NOT IN ('lab_to_other','other_to_lab') THEN
      RAISE EXCEPTION 'serbest gönderide yön lab_to_other veya other_to_lab olmalı';
    END IF;
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_work_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = v_caller;
  END IF;
  IF v_lab_id IS NULL THEN v_lab_id := v_caller; END IF;

  -- Klinik/hekim yalnız siparişten çözülür; serbest gönderide sorgu hiç çalışmaz.
  IF NOT v_free THEN
    SELECT
      COALESCE(d.full_name, p.full_name),
      COALESCE(c.address, ''),
      COALESCE(d.phone, p.phone, ''),
      COALESCE(c.name, '')
    INTO v_cli_name, v_cli_addr, v_cli_phone, v_org_name
    FROM public.work_orders wo
    LEFT JOIN public.doctors  d ON d.id = wo.doctor_id
    LEFT JOIN public.clinics  c ON c.id = d.clinic_id
    LEFT JOIN public.profiles p ON p.id = wo.doctor_id
    WHERE wo.id = p_work_order_id;
  END IF;

  SELECT l.name, NULLIF(TRIM(l.address), ''), NULLIF(TRIM(l.phone), '')
    INTO v_lab_name, v_lab_addr, v_lab_phone
    FROM public.labs l WHERE l.id = v_lab_id;

  SELECT
    COALESCE(v_lab_addr,  NULLIF(TRIM(pc.credentials->>'pickup_address'), '')),
    COALESCE(v_lab_phone, NULLIF(TRIM(pc.credentials->>'pickup_phone'), '')),
    NULLIF(pc.credentials->>'pickup_lat', '')::NUMERIC,
    NULLIF(pc.credentials->>'pickup_lng', '')::NUMERIC
  INTO v_lab_addr, v_lab_phone, v_lab_lat, v_lab_lng
  FROM public.provider_credentials pc
  WHERE pc.lab_id = v_lab_id AND pc.type = 'courier' AND pc.is_active = true
  LIMIT 1;

  v_lab_name := COALESCE(NULLIF(TRIM(v_lab_name), ''), 'Laboratuvar');

  v_incoming := (COALESCE(p_direction, 'lab_to_clinic') = 'clinic_to_lab');

  -- SİPARİŞE BAĞLI DIŞ SERVİS (milling, döküm, lehim…): karşı taraf klinik DEĞİL,
  -- formda girilen adres. Bu dal olmasaydı yön lab_to_other iken aşağıdaki
  -- "lab → klinik" dalına düşer ve kurye KLİNİK adresine gönderilirdi.
  IF NOT v_free AND p_direction IN ('lab_to_other','other_to_lab') THEN
    IF COALESCE(TRIM(p_party_name), '') = '' OR COALESCE(TRIM(p_party_address), '') = '' THEN
      RAISE EXCEPTION 'dış servis bacağında ad ve adres zorunlu';
    END IF;
    IF p_direction = 'other_to_lab' THEN          -- dış servisten ALIM
      v_org_name  := TRIM(p_party_name);
      v_org_addr  := TRIM(p_party_address);
      v_org_lat   := p_party_lat;  v_org_lng := p_party_lng;
      v_dest_name := v_lab_name;
      v_dest_addr := v_lab_addr;   v_dest_phone := v_lab_phone;
      v_dest_lat  := v_lab_lat;    v_dest_lng := v_lab_lng;
    ELSE                                          -- dış servise GÖNDERİ
      v_org_name  := v_lab_name;
      v_org_addr  := v_lab_addr;
      v_org_lat   := v_lab_lat;    v_org_lng := v_lab_lng;
      v_dest_name := TRIM(p_party_name);
      v_dest_addr := TRIM(p_party_address);
      v_dest_phone:= NULLIF(TRIM(COALESCE(p_party_phone, '')), '');
      v_dest_lat  := p_party_lat;  v_dest_lng := p_party_lng;
    END IF;

  ELSIF v_free THEN
    IF p_direction = 'other_to_lab' THEN          -- ALIM: girilen adres ÇIKIŞ
      v_org_name  := TRIM(p_party_name);
      v_org_addr  := TRIM(p_party_address);
      v_org_lat   := p_party_lat;  v_org_lng := p_party_lng;
      v_dest_name := v_lab_name;
      v_dest_addr := v_lab_addr;   v_dest_phone := v_lab_phone;
      v_dest_lat  := v_lab_lat;    v_dest_lng := v_lab_lng;
    ELSE                                          -- GÖNDERİ: girilen adres VARIŞ
      v_org_name  := v_lab_name;
      v_org_addr  := v_lab_addr;
      v_org_lat   := v_lab_lat;    v_org_lng := v_lab_lng;
      v_dest_name := TRIM(p_party_name);
      v_dest_addr := TRIM(p_party_address);
      v_dest_phone:= NULLIF(TRIM(COALESCE(p_party_phone, '')), '');
      v_dest_lat  := p_party_lat;  v_dest_lng := p_party_lng;
    END IF;

    INSERT INTO public.shipment_number_counters AS c (lab_id, year, last_no)
    VALUES (v_lab_id, v_year, 1)
    ON CONFLICT (lab_id, year) DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_no;
    v_ship_no := 'GND-' || v_year::text || '-' || LPAD(v_no::text, 4, '0');

  ELSIF v_incoming THEN
    v_org_name  := COALESCE(NULLIF(v_org_name, ''), v_cli_name);
    v_org_addr  := NULLIF(v_cli_addr, '');
    v_org_lat   := NULL;  v_org_lng := NULL;
    v_dest_name := v_lab_name;
    v_dest_addr := v_lab_addr;
    v_dest_phone:= v_lab_phone;
    v_dest_lat  := v_lab_lat;  v_dest_lng := v_lab_lng;
  ELSE
    v_org_name  := v_lab_name;
    v_org_addr  := v_lab_addr;
    v_org_lat   := v_lab_lat;  v_org_lng := v_lab_lng;
    v_dest_name := v_cli_name;
    v_dest_addr := v_cli_addr;
    v_dest_phone:= v_cli_phone;
    v_dest_lat  := NULL;  v_dest_lng := NULL;
  END IF;

  v_currency := p_fee_currency;
  IF v_currency IS NULL AND p_fee_amount IS NOT NULL THEN
    SELECT default_currency INTO v_currency FROM public.lab_settings WHERE lab_id = v_lab_id;
    v_currency := COALESCE(v_currency, 'TRY');
  END IF;

  INSERT INTO public.deliveries (
    lab_id, work_order_id, shipment_no, mode, courier_id,
    external_provider, external_tracking_no,
    destination_name, destination_address, destination_phone,
    dest_lat, dest_lng,
    origin_name, origin_address, origin_lat, origin_lng,
    notes, status,
    purpose, direction, fee_amount, fee_currency, fee_source, stage_snapshot
  ) VALUES (
    v_lab_id, p_work_order_id, v_ship_no, p_mode, p_courier_id,
    p_external_provider, p_external_tracking_no,
    v_dest_name, COALESCE(v_dest_addr, ''), COALESCE(v_dest_phone, ''),
    v_dest_lat, v_dest_lng,
    v_org_name, v_org_addr, v_org_lat, v_org_lng,
    p_notes,
    'beklemede'::delivery_status,
    -- Serbest gönderi bir sipariş teslimatı değildir; 'teslimat' sayılsaydı
    -- kurye amaç raporunda gerçek teslimatlarla karışırdı.
    COALESCE(p_purpose, CASE WHEN v_free THEN 'diger' ELSE 'teslimat' END),
    COALESCE(p_direction, 'lab_to_clinic'),
    p_fee_amount,
    v_currency,
    CASE WHEN p_fee_amount IS NULL THEN NULL ELSE COALESCE(p_fee_source, 'manuel') END,
    p_stage_snapshot
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;
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
$function$

;
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_direction_chk;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_direction_chk CHECK (direction = ANY (ARRAY['lab_to_clinic','clinic_to_lab','lab_to_other','other_to_lab']));
ALTER TABLE public.deliveries DROP COLUMN IF EXISTS origin_phone;
COMMIT;
