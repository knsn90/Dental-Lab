-- 20260827 — Mevcut bir siparişi başka siparişin DEVAM'ı veya REVİZYON'u yap.
--
-- createRevisionOrder/devam sihirbazı YENİ sipariş oluşturur; bu RPC ise ZATEN
-- var olan bir siparişe geriye dönük ebeveyn bağı kurar (continues_order_id VEYA
-- revision_of_id + meta). Yetki: user_type='admin' VEYA lab manager/admin.
BEGIN;

CREATE OR REPLACE FUNCTION public.link_order_relation(
  p_order_id         uuid,
  p_parent_id        uuid,
  p_type             text,               -- 'continuation' | 'revision'
  p_reason           text DEFAULT NULL,
  p_responsible      text DEFAULT NULL,  -- revision: 'lab' | 'client'
  p_fault_station_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid(); v_user_type text; v_role text;
  v_child public.work_orders%ROWTYPE; v_parent public.work_orders%ROWTYPE;
  v_next int; v_fault uuid; v_cursor uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_type NOT IN ('continuation','revision') THEN RAISE EXCEPTION 'invalid type'; END IF;
  IF p_order_id = p_parent_id THEN RAISE EXCEPTION 'Bir siparis kendine baglanamaz'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_child  FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_parent FROM public.work_orders WHERE id = p_parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'parent order not found'; END IF;

  IF v_user_type <> 'admin' AND (
       v_child.lab_id  IS DISTINCT FROM public.get_my_lab_id()
    OR v_parent.lab_id IS DISTINCT FROM public.get_my_lab_id()
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_child.lab_id IS DISTINCT FROM v_parent.lab_id THEN
    RAISE EXCEPTION 'Ayni laboratuvar siparisleri olmali'; END IF;

  -- Döngü koruması: ebeveynin zinciri bu siparişi içermemeli.
  v_cursor := p_parent_id;
  FOR i IN 1..60 LOOP
    EXIT WHEN v_cursor IS NULL;
    IF v_cursor = p_order_id THEN RAISE EXCEPTION 'Dongu: bu siparis zaten zincirde'; END IF;
    SELECT COALESCE(revision_of_id, continues_order_id) INTO v_cursor
      FROM public.work_orders WHERE id = v_cursor;
  END LOOP;

  IF p_type = 'continuation' THEN
    UPDATE public.work_orders
       SET continues_order_id = p_parent_id,
           revision_of_id = NULL, revision_no = NULL, revision_reason = NULL,
           revision_responsible = NULL, revision_fault_station_id = NULL
     WHERE id = p_order_id;
  ELSE
    IF p_responsible IS NULL OR p_responsible NOT IN ('lab','client') THEN
      RAISE EXCEPTION 'Sorumluluk secilmeli: lab veya client'; END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'Revizyon sebebi zorunlu'; END IF;

    SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_next
      FROM public.work_orders WHERE revision_of_id = p_parent_id;

    v_fault := NULL;
    IF p_responsible = 'lab' AND p_fault_station_id IS NOT NULL THEN
      SELECT id INTO v_fault FROM public.lab_stations
       WHERE id = p_fault_station_id AND lab_profile_id = v_child.lab_id;
    END IF;

    UPDATE public.work_orders
       SET revision_of_id = p_parent_id, revision_no = v_next,
           revision_reason = trim(p_reason), revision_responsible = p_responsible,
           revision_fault_station_id = v_fault, continues_order_id = NULL
     WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_order_relation(uuid,uuid,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_order_relation(uuid,uuid,text,text,text,uuid) TO authenticated;

COMMIT;
