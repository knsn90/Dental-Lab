-- clinics.address JSON string olarak saklanıyor ({il, ilce, mahalle}).
-- create_delivery resolver bu JSON'u parse edip "Mahalle, İlçe, İl" formatına çeviriyor.
-- Plain string ise olduğu gibi kullanılır.

CREATE OR REPLACE FUNCTION public.format_clinic_address(p_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_json JSONB;
  v_parts TEXT[];
  v_il TEXT; v_ilce TEXT; v_mahalle TEXT;
BEGIN
  IF p_raw IS NULL OR TRIM(p_raw) = '' THEN RETURN NULL; END IF;
  -- JSON ise parse
  BEGIN
    v_json := p_raw::jsonb;
    v_mahalle := v_json->>'mahalle';
    v_ilce    := v_json->>'ilce';
    v_il      := v_json->>'il';
    v_parts := ARRAY[]::TEXT[];
    IF v_mahalle IS NOT NULL AND v_mahalle <> '' THEN v_parts := array_append(v_parts, v_mahalle); END IF;
    IF v_ilce    IS NOT NULL AND v_ilce    <> '' THEN v_parts := array_append(v_parts, v_ilce); END IF;
    IF v_il      IS NOT NULL AND v_il      <> '' THEN v_parts := array_append(v_parts, v_il); END IF;
    IF array_length(v_parts, 1) IS NULL THEN RETURN NULL; END IF;
    RETURN array_to_string(v_parts, ', ');
  EXCEPTION WHEN OTHERS THEN
    -- Plain string
    RETURN p_raw;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_delivery(
  p_work_order_id        UUID,
  p_mode                 TEXT,
  p_courier_id           UUID DEFAULT NULL,
  p_external_provider    TEXT DEFAULT NULL,
  p_external_tracking_no TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_doctor_id UUID;
  v_dest_name TEXT; v_dest_addr TEXT; v_dest_phone TEXT;
  v_raw_addr  TEXT;
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

  SELECT lab_id, doctor_id INTO v_lab_id, v_doctor_id
    FROM public.work_orders WHERE id = p_work_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = v_caller;
  END IF;
  IF v_lab_id IS NULL THEN v_lab_id := v_caller; END IF;

  -- 1) doctors → clinics
  SELECT d.full_name, c.address, COALESCE(d.phone, '')
    INTO v_dest_name, v_raw_addr, v_dest_phone
    FROM public.doctors d
    LEFT JOIN public.clinics c ON c.id = d.clinic_id
   WHERE d.id = v_doctor_id;

  -- 2) profile fallback
  IF v_dest_name IS NULL THEN
    SELECT
      p.full_name,
      COALESCE(c.address, p.address, p.clinic_name),
      COALESCE(p.phone, '')
      INTO v_dest_name, v_raw_addr, v_dest_phone
      FROM public.profiles p
      LEFT JOIN public.clinics c ON c.id = p.clinic_id
     WHERE p.id = v_doctor_id;
  END IF;

  v_dest_addr := public.format_clinic_address(v_raw_addr);

  INSERT INTO public.deliveries (
    lab_id, work_order_id, mode, courier_id,
    external_provider, external_tracking_no,
    destination_name, destination_address, destination_phone,
    notes, status
  ) VALUES (
    v_lab_id, p_work_order_id, p_mode, p_courier_id,
    p_external_provider, p_external_tracking_no,
    COALESCE(v_dest_name, 'Alıcı'),
    COALESCE(NULLIF(TRIM(v_dest_addr), ''), 'Adres eksik'),
    v_dest_phone,
    p_notes,
    'beklemede'::delivery_status
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_delivery(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Mevcut aktif teslimatları yeniden formatla
UPDATE public.deliveries dlv
   SET destination_address = COALESCE(NULLIF(TRIM(sub.dest_addr_fmt), ''), dlv.destination_address)
  FROM (
    SELECT
      wo.id AS wo_id,
      public.format_clinic_address(
        COALESCE(c1.address, c2.address, p.address, p.clinic_name)
      ) AS dest_addr_fmt
    FROM public.work_orders wo
    LEFT JOIN public.doctors  d  ON d.id = wo.doctor_id
    LEFT JOIN public.clinics  c1 ON c1.id = d.clinic_id
    LEFT JOIN public.profiles p  ON p.id = wo.doctor_id
    LEFT JOIN public.clinics  c2 ON c2.id = p.clinic_id
  ) sub
 WHERE dlv.work_order_id = sub.wo_id
   AND dlv.status NOT IN ('teslim_edildi','iptal');
