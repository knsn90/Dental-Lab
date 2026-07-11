-- clinics.address JSON artık {il, ilce, mahalle, sokak, bina_no, posta_kodu}.
-- format_clinic_address tüm alanları okunaklı string'e çevirir; geocoding doğruluğu artar.

CREATE OR REPLACE FUNCTION public.format_clinic_address(p_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_json     JSONB;
  v_parts    TEXT[];
  v_street   TEXT;
  v_mahalle  TEXT;
  v_ilce     TEXT;
  v_il       TEXT;
  v_pk       TEXT;
  v_sokak    TEXT;
  v_bino     TEXT;
BEGIN
  IF p_raw IS NULL OR TRIM(p_raw) = '' THEN RETURN NULL; END IF;
  BEGIN
    v_json := p_raw::jsonb;
    v_mahalle := NULLIF(TRIM(v_json->>'mahalle'), '');
    v_sokak   := NULLIF(TRIM(v_json->>'sokak'), '');
    v_bino    := NULLIF(TRIM(v_json->>'bina_no'), '');
    v_pk      := NULLIF(TRIM(v_json->>'posta_kodu'), '');
    v_ilce    := NULLIF(TRIM(v_json->>'ilce'), '');
    v_il      := NULLIF(TRIM(v_json->>'il'), '');

    -- "Sokak No: X" birleşik string
    IF v_sokak IS NOT NULL AND v_bino IS NOT NULL THEN
      v_street := v_sokak || ' No: ' || v_bino;
    ELSIF v_sokak IS NOT NULL THEN
      v_street := v_sokak;
    ELSIF v_bino IS NOT NULL THEN
      v_street := 'No: ' || v_bino;
    END IF;

    v_parts := ARRAY[]::TEXT[];
    IF v_mahalle IS NOT NULL THEN v_parts := array_append(v_parts, v_mahalle); END IF;
    IF v_street  IS NOT NULL THEN v_parts := array_append(v_parts, v_street); END IF;
    IF v_pk      IS NOT NULL THEN v_parts := array_append(v_parts, v_pk); END IF;
    IF v_ilce    IS NOT NULL THEN v_parts := array_append(v_parts, v_ilce); END IF;
    IF v_il      IS NOT NULL THEN v_parts := array_append(v_parts, v_il); END IF;

    IF array_length(v_parts, 1) IS NULL THEN RETURN NULL; END IF;
    RETURN array_to_string(v_parts, ', ');
  EXCEPTION WHEN OTHERS THEN
    RETURN p_raw;
  END;
END;
$$;

-- Mevcut aktif teslimatları yeni format'a göre güncelle
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
