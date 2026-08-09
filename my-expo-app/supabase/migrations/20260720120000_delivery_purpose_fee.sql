-- ============================================================
-- 20260720120000 — Kurye hareketleri: amaç + yön + ücret (Faz 1)
--
-- Bir sipariş yaşam döngüsünde birden çok kurye ihtiyacı olabilir
-- (eksik parça, model alma, prova gidiş/dönüş, iade...). deliveries
-- zaten sipariş başına çok kayıt tutabiliyor; bu migration kayıtları
-- SINIFLANDIRIR ve ÜCRETİNİ tutar. Ücret Faz 3'te sipariş maliyetine
-- eklenecek — bu migration yalnız veriyi taşır.
--
-- Geriye uyumluluk: tüm kolonlar nullable/default'lu, mevcut kayıtlar
-- purpose='teslimat' + direction='lab_to_clinic' olarak backfill edilir.
-- ============================================================

BEGIN;

-- 1) Yeni kolonlar --------------------------------------------------------
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS purpose        TEXT,
  ADD COLUMN IF NOT EXISTS direction      TEXT,
  ADD COLUMN IF NOT EXISTS fee_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fee_currency   TEXT,
  ADD COLUMN IF NOT EXISTS fee_source     TEXT,
  ADD COLUMN IF NOT EXISTS stage_snapshot TEXT;

COMMENT ON COLUMN public.deliveries.purpose        IS 'Kurye çağrısının amacı — teslimat = final teslimat, diğerleri ara hareket';
COMMENT ON COLUMN public.deliveries.direction      IS 'lab_to_clinic | clinic_to_lab';
COMMENT ON COLUMN public.deliveries.fee_amount     IS 'Kurye/kargo ücreti; NULL = henüz girilmedi. Faz 3''te sipariş maliyetine eklenir.';
COMMENT ON COLUMN public.deliveries.fee_currency   IS 'Ücretin para birimi (lab_settings.default_currency varsayılan). Baz para birimine ÇEVRİLMEZ.';
COMMENT ON COLUMN public.deliveries.fee_source     IS 'banabikurye = API''den geldi | manuel = kullanıcı girdi';
COMMENT ON COLUMN public.deliveries.stage_snapshot IS 'Kurye çağrıldığı andaki üretim aşaması adı (hangi aşamada ihtiyaç doğdu)';

-- 2) Backfill — mevcut kayıtların tamamı final teslimat ---------------------
UPDATE public.deliveries SET purpose   = 'teslimat'      WHERE purpose   IS NULL;
UPDATE public.deliveries SET direction = 'lab_to_clinic' WHERE direction IS NULL;

-- 3) Kısıtlar (backfill sonrası — mevcut satırlar uyumlu) ------------------
ALTER TABLE public.deliveries ALTER COLUMN purpose   SET DEFAULT 'teslimat';
ALTER TABLE public.deliveries ALTER COLUMN direction SET DEFAULT 'lab_to_clinic';

DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_purpose_chk
    CHECK (purpose IN ('teslimat','model_alma','eksik_parca','prova_gidis','prova_donus','iade','diger'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_direction_chk
    CHECK (direction IN ('lab_to_clinic','clinic_to_lab'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_fee_source_chk
    CHECK (fee_source IS NULL OR fee_source IN ('banabikurye','manuel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_fee_amount_chk
    CHECK (fee_amount IS NULL OR fee_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) İndeks — sipariş detayındaki lojistik listesi + final teslimat sorgusu
CREATE INDEX IF NOT EXISTS idx_deliveries_order_purpose
  ON public.deliveries(work_order_id, purpose, created_at DESC);

-- 5) create_delivery — amaç/yön/ücret parametreleriyle genişletildi --------
-- Eski 6 parametreli sürüm DROP edilir; aksi halde overload çakışması olur
-- ("function is not unique"). Yeni parametrelerin hepsi default'lu, mevcut
-- 6 argümanlı istemci çağrıları aynen çalışmaya devam eder.
DROP FUNCTION IF EXISTS public.create_delivery(UUID, TEXT, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_delivery(
  p_work_order_id        UUID,
  p_mode                 TEXT,             -- 'internal' | 'external'
  p_courier_id           UUID DEFAULT NULL,
  p_external_provider    TEXT DEFAULT NULL,
  p_external_tracking_no TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL,
  p_purpose              TEXT DEFAULT 'teslimat',
  p_direction            TEXT DEFAULT 'lab_to_clinic',
  p_fee_amount           NUMERIC DEFAULT NULL,
  p_fee_currency         TEXT DEFAULT NULL,
  p_fee_source           TEXT DEFAULT NULL,
  p_stage_snapshot       TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_dest_name TEXT; v_dest_addr TEXT; v_dest_phone TEXT;
  v_currency  TEXT;
  v_id        UUID;
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

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_work_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = v_caller;
  END IF;
  IF v_lab_id IS NULL THEN v_lab_id := v_caller; END IF;

  -- Hedef adres snapshot. Yön clinic_to_lab ise hedef LAB'dır; şu an lab
  -- adresi tek alanda tutulmadığından hedef adı lab adıyla işaretlenir,
  -- adres alanı UI'dan (notes/manuel) gelir.
  SELECT
    COALESCE(d.full_name, p.full_name),
    COALESCE(c.address, ''),
    COALESCE(d.phone, p.phone, '')
  INTO v_dest_name, v_dest_addr, v_dest_phone
  FROM public.work_orders wo
  LEFT JOIN public.doctors d  ON d.id = wo.doctor_id
  LEFT JOIN public.clinics c  ON c.id = d.clinic_id
  LEFT JOIN public.profiles p ON p.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  -- Ücret para birimi: verilmediyse lab'ın baz para birimi (₺ hardcode yok)
  v_currency := p_fee_currency;
  IF v_currency IS NULL AND p_fee_amount IS NOT NULL THEN
    SELECT default_currency INTO v_currency FROM public.lab_settings WHERE lab_id = v_lab_id;
    v_currency := COALESCE(v_currency, 'TRY');
  END IF;

  INSERT INTO public.deliveries (
    lab_id, work_order_id, mode, courier_id,
    external_provider, external_tracking_no,
    destination_name, destination_address, destination_phone,
    notes, status,
    purpose, direction, fee_amount, fee_currency, fee_source, stage_snapshot
  ) VALUES (
    v_lab_id, p_work_order_id, p_mode, p_courier_id,
    p_external_provider, p_external_tracking_no,
    v_dest_name, v_dest_addr, v_dest_phone,
    p_notes,
    'beklemede'::delivery_status,
    COALESCE(p_purpose, 'teslimat'),
    COALESCE(p_direction, 'lab_to_clinic'),
    p_fee_amount,
    v_currency,
    CASE WHEN p_fee_amount IS NULL THEN NULL ELSE COALESCE(p_fee_source, 'manuel') END,
    p_stage_snapshot
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;

-- 6) set_delivery_fee — ücreti sonradan gir / düzelt ------------------------
CREATE OR REPLACE FUNCTION public.set_delivery_fee(
  p_delivery_id UUID,
  p_amount      NUMERIC,
  p_currency    TEXT DEFAULT NULL,
  p_source      TEXT DEFAULT 'manuel'
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_currency  TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.deliveries WHERE id = p_delivery_id;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'delivery not found'; END IF;

  -- Lab kullanıcısı yalnız kendi lab'ının teslimatına dokunabilir
  IF v_user_type = 'lab' AND NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND (id = v_lab_id OR lab_id = v_lab_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'fee must be >= 0';
  END IF;

  v_currency := p_currency;
  IF v_currency IS NULL AND p_amount IS NOT NULL THEN
    SELECT default_currency INTO v_currency FROM public.lab_settings WHERE lab_id = v_lab_id;
    v_currency := COALESCE(v_currency, 'TRY');
  END IF;

  UPDATE public.deliveries
     SET fee_amount   = p_amount,
         fee_currency = CASE WHEN p_amount IS NULL THEN NULL ELSE v_currency END,
         fee_source   = CASE WHEN p_amount IS NULL THEN NULL ELSE COALESCE(p_source, 'manuel') END
   WHERE id = p_delivery_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_delivery_fee(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
