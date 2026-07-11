-- Hasta doğum tarihi (patient_dob) work_orders'a eklenir + düzenleme RPC'lerine dahil edilir.
-- Kolon yoktu; yeni-sipariş formu patient_dob topluyordu ama createWorkOrder strip'liyordu.

ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS patient_dob date;

-- client_update_order + _apply_order_edit'e patient_dob satırı eklenir (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.client_update_order(
  p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL
) RETURNS public.work_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row   public.work_orders;
  v_item  jsonb;
  v_teeth int[];
BEGIN
  IF NOT public._client_owns_order(p_order_id) THEN
    RAISE EXCEPTION 'Bu siparişi düzenleme yetkiniz yok.' USING errcode = '42501';
  END IF;
  IF public._order_planning_started(p_order_id) THEN
    RAISE EXCEPTION 'Planlaması başlamış sipariş doğrudan düzenlenemez; değişiklik talebi gerekir.' USING errcode = 'P0001';
  END IF;

  IF p_fields ? 'tooth_numbers' THEN
    SELECT array_agg((x)::int) INTO v_teeth
    FROM jsonb_array_elements_text(p_fields->'tooth_numbers') AS t(x);
  END IF;

  UPDATE public.work_orders SET
    patient_name        = coalesce(p_fields->>'patient_name',        patient_name),
    patient_id          = coalesce(p_fields->>'patient_id',          patient_id),
    patient_gender      = coalesce(p_fields->>'patient_gender',      patient_gender),
    patient_dob         = coalesce((p_fields->>'patient_dob')::date, patient_dob),
    patient_nationality = coalesce(p_fields->>'patient_nationality', patient_nationality),
    patient_country     = coalesce(p_fields->>'patient_country',     patient_country),
    patient_city        = coalesce(p_fields->>'patient_city',        patient_city),
    work_type           = coalesce(p_fields->>'work_type',           work_type),
    shade               = coalesce(p_fields->>'shade',               shade),
    model_type          = coalesce(p_fields->>'model_type',          model_type),
    delivery_method     = coalesce(p_fields->>'delivery_method',     delivery_method),
    delivery_date       = coalesce((p_fields->>'delivery_date')::date, delivery_date),
    is_urgent           = coalesce((p_fields->>'is_urgent')::boolean,  is_urgent),
    notes               = coalesce(p_fields->>'notes',               notes),
    tooth_numbers       = coalesce(v_teeth,                          tooth_numbers),
    updated_at          = now()
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.' USING errcode = 'P0002';
  END IF;

  IF p_items IS NOT NULL THEN
    DELETE FROM public.order_items WHERE work_order_id = p_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (work_order_id, name, price, quantity, tooth_numbers, notes)
      VALUES (
        p_order_id,
        coalesce(v_item->>'name', ''),
        coalesce((v_item->>'price')::numeric, 0),
        coalesce((v_item->>'quantity')::int, 1),
        CASE WHEN v_item ? 'tooth_numbers'
          THEN (SELECT array_agg((x)::int) FROM jsonb_array_elements_text(v_item->'tooth_numbers') AS t(x))
          ELSE NULL END,
        nullif(v_item->>'notes', '')
      );
    END LOOP;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public._apply_order_edit(
  p_order_id uuid, p_fields jsonb, p_items jsonb
) RETURNS public.work_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row   public.work_orders;
  v_item  jsonb;
  v_teeth int[];
BEGIN
  IF p_fields ? 'tooth_numbers' THEN
    SELECT array_agg((x)::int) INTO v_teeth
    FROM jsonb_array_elements_text(p_fields->'tooth_numbers') AS t(x);
  END IF;

  UPDATE public.work_orders SET
    patient_name        = coalesce(p_fields->>'patient_name',        patient_name),
    patient_id          = coalesce(p_fields->>'patient_id',          patient_id),
    patient_gender      = coalesce(p_fields->>'patient_gender',      patient_gender),
    patient_dob         = coalesce((p_fields->>'patient_dob')::date, patient_dob),
    patient_nationality = coalesce(p_fields->>'patient_nationality', patient_nationality),
    patient_country     = coalesce(p_fields->>'patient_country',     patient_country),
    patient_city        = coalesce(p_fields->>'patient_city',        patient_city),
    work_type           = coalesce(p_fields->>'work_type',           work_type),
    shade               = coalesce(p_fields->>'shade',               shade),
    model_type          = coalesce(p_fields->>'model_type',          model_type),
    delivery_method     = coalesce(p_fields->>'delivery_method',     delivery_method),
    delivery_date       = coalesce((p_fields->>'delivery_date')::date, delivery_date),
    is_urgent           = coalesce((p_fields->>'is_urgent')::boolean,  is_urgent),
    notes               = coalesce(p_fields->>'notes',               notes),
    tooth_numbers       = coalesce(v_teeth,                          tooth_numbers),
    updated_at          = now()
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.' USING errcode = 'P0002';
  END IF;

  IF p_items IS NOT NULL THEN
    DELETE FROM public.order_items WHERE work_order_id = p_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (work_order_id, name, price, quantity, tooth_numbers, notes)
      VALUES (
        p_order_id,
        coalesce(v_item->>'name', ''),
        coalesce((v_item->>'price')::numeric, 0),
        coalesce((v_item->>'quantity')::int, 1),
        CASE WHEN v_item ? 'tooth_numbers'
          THEN (SELECT array_agg((x)::int) FROM jsonb_array_elements_text(v_item->'tooth_numbers') AS t(x))
          ELSE NULL END,
        nullif(v_item->>'notes', '')
      );
    END LOOP;
  END IF;

  RETURN v_row;
END;
$$;
