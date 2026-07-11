-- Faz 1 — Sipariş kalemi fiyatı 3-kademe öncelikle çözülür:
--   1. clinic_price_overrides.custom_price            (klinik özel anlaşması)
--   2. promotions (active + tarihte geçerli + clinic/scope eşleşmesi)
--   3. lab_services.price                              (default katalog)

-- 1. order_items → manuel override işareti (audit)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS price_was_overridden boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.order_items.price_was_overridden IS
  'TRUE ise müdür otomatik fiyatı değiştirdi — audit için';

-- 2. resolve_item_price RPC
CREATE OR REPLACE FUNCTION public.resolve_item_price(
  p_lab_id     uuid,
  p_service_id uuid,
  p_clinic_id  uuid,
  p_order_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  price       numeric,
  currency    text,
  source      text,    -- 'clinic_override' | 'promotion' | 'catalog'
  source_id   uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price    numeric;
  v_currency      text := 'TRY';
  v_override_id   uuid;
  v_override_price numeric;
  v_override_pct  numeric;
  v_promo_id      uuid;
  v_promo_type    text;
  v_promo_value   numeric;
  v_service_cat   text;
BEGIN
  -- Servis base fiyatı + kategori
  SELECT s.price, COALESCE(s.currency, 'TRY'), s.category
  INTO v_base_price, v_currency, v_service_cat
  FROM public.lab_services s
  WHERE s.id = p_service_id AND s.lab_id = p_lab_id;

  IF v_base_price IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 'TRY'::text, 'none'::text, NULL::uuid;
    RETURN;
  END IF;

  -- 1) Clinic override (custom_price veya discount_percent)
  IF p_clinic_id IS NOT NULL THEN
    SELECT id, custom_price, discount_percent
    INTO v_override_id, v_override_price, v_override_pct
    FROM public.clinic_price_overrides
    WHERE service_id = p_service_id
      AND clinic_id = p_clinic_id
      AND lab_id = p_lab_id
    LIMIT 1;

    IF v_override_id IS NOT NULL THEN
      IF v_override_price IS NOT NULL THEN
        RETURN QUERY SELECT v_override_price, v_currency, 'clinic_override'::text, v_override_id;
        RETURN;
      ELSIF v_override_pct IS NOT NULL AND v_override_pct > 0 THEN
        RETURN QUERY SELECT
          ROUND(v_base_price * (100 - v_override_pct) / 100, 2),
          v_currency, 'clinic_override'::text, v_override_id;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 2) Promotion (aktif + tarihte geçerli + scope/clinic eşleşmesi)
  SELECT p.id, p.discount_type, p.discount_value
  INTO v_promo_id, v_promo_type, v_promo_value
  FROM public.promotions p
  WHERE p.lab_id = p_lab_id
    AND p.is_active = TRUE
    AND (p.starts_at IS NULL OR p.starts_at <= p_order_date)
    AND (p.ends_at   IS NULL OR p.ends_at   >= p_order_date)
    AND (
      p.scope = 'all'
      OR (p.scope = 'category' AND p.category = v_service_cat)
      OR (p.scope = 'services' AND p.category = v_service_cat)
    )
    AND (
      p.clinic_ids IS NULL
      OR array_length(p.clinic_ids, 1) IS NULL
      OR p_clinic_id::text = ANY(p.clinic_ids)
    )
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_promo_id IS NOT NULL THEN
    IF v_promo_type = 'percent' THEN
      RETURN QUERY SELECT
        ROUND(v_base_price * (100 - v_promo_value) / 100, 2),
        v_currency, 'promotion'::text, v_promo_id;
      RETURN;
    ELSIF v_promo_type = 'fixed' THEN
      RETURN QUERY SELECT
        GREATEST(0, v_base_price - v_promo_value),
        v_currency, 'promotion'::text, v_promo_id;
      RETURN;
    END IF;
  END IF;

  -- 3) Default katalog
  RETURN QUERY SELECT v_base_price, v_currency, 'catalog'::text, p_service_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_item_price(uuid, uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.resolve_item_price IS
  '3-kademe fiyat çözümleyici — clinic override > promotion > catalog. UI: sipariş kalemi eklenirken çağrılır.';
