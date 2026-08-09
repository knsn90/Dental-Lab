-- create_delivery — YÖN DUYARLI uç noktalar
--
-- SORUN: fonksiyon `p_direction` parametresini alıyor ve satıra yazıyordu, ama
-- hedefi seçerken KULLANMIYORDU. Hedef her zaman siparişin hekimi + kliniğiydi.
-- Klinikten alım (`clinic_to_lab`) bacaklarında bu, çıkış ve varışın AYNI adres
-- olması demek: Kurye Takip haritası "Ataşehir → Ataşehir" rotası çiziyor,
-- panelde gönderen ve alıcı aynı yeri gösteriyordu.
--
-- BanaBiKurye'ye giden istek zaten doğruydu (`banabikurye-dispatch` içinde
-- `incoming ? clinicPoint : labPoint`), o yüzden sağlayıcı panelinde her şey
-- doğru görünüyor — hata yalnız KENDİ kaydımızdaydı.
--
-- LABORATUVAR ADRESİ nerede: `labs.address` boş; gerçek adres kurye
-- entegrasyonunun alış bilgilerinde duruyor (`provider_credentials.credentials`
-- → pickup_address / pickup_lat / pickup_lng / pickup_phone). Orada KOORDİNAT da
-- var, bu yüzden lab ucu için geokodlamaya hiç gerek yok.
--
-- EK KAZANÇ: lab çıkışlı (varsayılan) bacaklarda da artık `origin_*` doldurulur.
-- Önceden her iki uç da boştu ve harita iki ucu da adres metninden geokodluyordu.
--
-- GERİYE DÖNÜK: mevcut satırlara dokunmaz. Yalnız bundan sonra oluşturulan
-- teslimatlar etkilenir.

CREATE OR REPLACE FUNCTION public.create_delivery(
  p_work_order_id        uuid,
  p_mode                 text,
  p_courier_id           uuid DEFAULT NULL::uuid,
  p_external_provider    text DEFAULT NULL::text,
  p_external_tracking_no text DEFAULT NULL::text,
  p_notes                text DEFAULT NULL::text,
  p_purpose              text DEFAULT 'teslimat'::text,
  p_direction            text DEFAULT 'lab_to_clinic'::text,
  p_fee_amount           numeric DEFAULT NULL::numeric,
  p_fee_currency         text DEFAULT NULL::text,
  p_fee_source           text DEFAULT NULL::text,
  p_stage_snapshot       text DEFAULT NULL::text
)
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

  -- Klinik/hekim ucu (siparişin karşı tarafı)
  v_cli_name  TEXT; v_cli_addr TEXT; v_cli_phone TEXT;
  -- Laboratuvar ucu (sabit; kurye entegrasyonunun alış bilgisi)
  v_lab_name  TEXT; v_lab_addr TEXT; v_lab_phone TEXT;
  v_lab_lat   NUMERIC; v_lab_lng NUMERIC;

  v_incoming  BOOLEAN;

  -- Satıra yazılacak nihai uçlar
  v_dest_name TEXT; v_dest_addr TEXT; v_dest_phone TEXT;
  v_dest_lat  NUMERIC; v_dest_lng NUMERIC;
  v_org_name  TEXT; v_org_addr TEXT;
  v_org_lat   NUMERIC; v_org_lng NUMERIC;
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

  -- ── Klinik/hekim ucu ────────────────────────────────────────────────
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

  -- ── Laboratuvar ucu ─────────────────────────────────────────────────
  -- Öncelik labs.address (ileride Ayarlar'dan girilecek); yoksa kurye
  -- entegrasyonunun alış adresi. Koordinat yalnız entegrasyonda var.
  SELECT l.name INTO v_lab_name FROM public.labs l WHERE l.id = v_lab_id;
  SELECT NULLIF(TRIM(l.address), '') INTO v_lab_addr FROM public.labs l WHERE l.id = v_lab_id;
  SELECT NULLIF(TRIM(l.phone), '')   INTO v_lab_phone FROM public.labs l WHERE l.id = v_lab_id;

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

  -- ── Yöne göre uçları ata ────────────────────────────────────────────
  v_incoming := (COALESCE(p_direction, 'lab_to_clinic') = 'clinic_to_lab');

  IF v_incoming THEN
    -- Klinikten alım: çıkış klinik, varış LABORATUVAR
    v_org_name  := COALESCE(NULLIF(v_org_name, ''), v_cli_name);
    v_org_addr  := NULLIF(v_cli_addr, '');
    v_org_lat   := NULL;  v_org_lng := NULL;   -- klinik koordinatı yok → geokod
    v_dest_name := v_lab_name;
    v_dest_addr := v_lab_addr;
    v_dest_phone:= v_lab_phone;
    v_dest_lat  := v_lab_lat;  v_dest_lng := v_lab_lng;
  ELSE
    -- Lab çıkışı (varsayılan): çıkış LABORATUVAR, varış klinik/hekim
    v_org_name  := v_lab_name;
    v_org_addr  := v_lab_addr;
    v_org_lat   := v_lab_lat;  v_org_lng := v_lab_lng;
    v_dest_name := v_cli_name;
    v_dest_addr := v_cli_addr;
    v_dest_phone:= v_cli_phone;
    v_dest_lat  := NULL;  v_dest_lng := NULL;  -- klinik koordinatı yok → geokod
  END IF;

  v_currency := p_fee_currency;
  IF v_currency IS NULL AND p_fee_amount IS NOT NULL THEN
    SELECT default_currency INTO v_currency FROM public.lab_settings WHERE lab_id = v_lab_id;
    v_currency := COALESCE(v_currency, 'TRY');
  END IF;

  INSERT INTO public.deliveries (
    lab_id, work_order_id, mode, courier_id,
    external_provider, external_tracking_no,
    destination_name, destination_address, destination_phone,
    dest_lat, dest_lng,
    origin_name, origin_address, origin_lat, origin_lng,
    notes, status,
    purpose, direction, fee_amount, fee_currency, fee_source, stage_snapshot
  ) VALUES (
    v_lab_id, p_work_order_id, p_mode, p_courier_id,
    p_external_provider, p_external_tracking_no,
    v_dest_name, COALESCE(v_dest_addr, ''), COALESCE(v_dest_phone, ''),
    v_dest_lat, v_dest_lng,
    v_org_name, v_org_addr, v_org_lat, v_org_lng,
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
$function$;
