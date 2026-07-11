-- Faz B — Planlama SONRASI sipariş DEĞİŞİKLİK TALEBİ (lab onayı ile uygulanır).
-- Klinik/hekim değişiklik talebi oluşturur; admin + mesul müdür (lab manager) onaylar.
-- Onaylanınca önerilen alanlar + kalemler siparişe uygulanır (planlama kapısı AŞILIR).
-- Desen: order_cancellation_requests ile birebir (is_cancel_approver onaylayıcı).

-- 1) Talep tablosu
CREATE TABLE IF NOT EXISTS public.order_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lab_id          uuid,
  requested_by    uuid NOT NULL,
  requester_name  text,
  proposed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_items  jsonb,                 -- null = kalemlere dokunma
  note            text,                  -- talep edenin açıklaması
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ochr_pending
  ON public.order_change_requests(work_order_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ochr_status
  ON public.order_change_requests(status, created_at DESC);

ALTER TABLE public.order_change_requests ENABLE ROW LEVEL SECURITY;

-- RLS: owner (hekim/klinik) oluşturur; owner + onaylayıcı görür; onaylayıcı günceller.
DROP POLICY IF EXISTS ochr_insert ON public.order_change_requests;
CREATE POLICY ochr_insert ON public.order_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND public._client_owns_order(work_order_id));

DROP POLICY IF EXISTS ochr_select ON public.order_change_requests;
CREATE POLICY ochr_select ON public.order_change_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_cancel_approver());

DROP POLICY IF EXISTS ochr_update ON public.order_change_requests;
CREATE POLICY ochr_update ON public.order_change_requests
  FOR UPDATE TO authenticated
  USING (public.is_cancel_approver()) WITH CHECK (public.is_cancel_approver());

-- 2) Ortak "uygula" yardımcısı — client_update_order gövdesiyle aynı, YETKİ/GATE YOK.
--    (Hem approve RPC hem ileride başka akışlar kullanabilir.)
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

-- 3) Talep oluştur (owner). Planlama gate'i YOK — bu bir taleptir, henüz uygulanmaz.
CREATE OR REPLACE FUNCTION public.create_order_change_request(
  p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS public.order_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_req  public.order_change_requests;
  v_lab  uuid;
  v_name text;
BEGIN
  IF NOT public._client_owns_order(p_order_id) THEN
    RAISE EXCEPTION 'Bu sipariş için değişiklik talebi oluşturamazsınız.' USING errcode = '42501';
  END IF;

  SELECT lab_id INTO v_lab FROM public.work_orders WHERE id = p_order_id;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.order_change_requests
    (work_order_id, lab_id, requested_by, requester_name, proposed_fields, proposed_items, note)
  VALUES
    (p_order_id, v_lab, auth.uid(), v_name, coalesce(p_fields, '{}'::jsonb), p_items, nullif(p_note, ''))
  RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

-- 4) Onayla → önerilen değişiklikleri uygula + talebi kapat (onaylayıcı).
CREATE OR REPLACE FUNCTION public.approve_order_change_request(
  p_request_id uuid, p_note text DEFAULT NULL
) RETURNS public.order_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_req public.order_change_requests;
BEGIN
  IF NOT public.is_cancel_approver() THEN
    RAISE EXCEPTION 'Bu talebi onaylama yetkiniz yok.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_req FROM public.order_change_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı.' USING errcode = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Talep zaten sonuçlanmış.' USING errcode = 'P0001';
  END IF;

  PERFORM public._apply_order_edit(v_req.work_order_id, v_req.proposed_fields, v_req.proposed_items);

  UPDATE public.order_change_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(p_note, '')
   WHERE id = p_request_id
   RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

-- 5) Reddet (onaylayıcı).
CREATE OR REPLACE FUNCTION public.reject_order_change_request(
  p_request_id uuid, p_note text DEFAULT NULL
) RETURNS public.order_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_req public.order_change_requests;
BEGIN
  IF NOT public.is_cancel_approver() THEN
    RAISE EXCEPTION 'Bu talebi reddetme yetkiniz yok.' USING errcode = '42501';
  END IF;
  UPDATE public.order_change_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(p_note, '')
   WHERE id = p_request_id AND status = 'pending'
   RETURNING * INTO v_req;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı veya zaten sonuçlanmış.' USING errcode = 'P0002';
  END IF;
  RETURN v_req;
END;
$$;

-- 6) Bildirim trigger'ı (SECURITY DEFINER → RLS aşılır). Kategori 'approval'.
CREATE OR REPLACE FUNCTION public.notify_change_request() RETURNS trigger AS $$
DECLARE ord_no text;
BEGIN
  SELECT order_number::text INTO ord_no FROM public.work_orders WHERE id = NEW.work_order_id;
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id)
    SELECT p.id, NEW.lab_id, 'approval', 'Sipariş değişiklik talebi',
           'Sipariş #' || COALESCE(ord_no, '') || ' için değişiklik talebi geldi.',
           'work_order', NEW.work_order_id
    FROM public.profiles p
    WHERE (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
      AND (NEW.lab_id IS NULL OR p.lab_id = NEW.lab_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('approved','rejected')) THEN
    INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id)
    VALUES (NEW.requested_by, NEW.lab_id, 'approval',
            CASE WHEN NEW.status = 'approved' THEN 'Değişiklik talebin onaylandı' ELSE 'Değişiklik talebin reddedildi' END,
            CASE WHEN NEW.status = 'approved'
                 THEN 'Sipariş #' || COALESCE(ord_no, '') || ' değişiklikleri uygulandı.'
                 ELSE COALESCE(NEW.review_note, 'Değişiklik talebin reddedildi.') END,
            'work_order', NEW.work_order_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_change_request ON public.order_change_requests;
CREATE TRIGGER trg_notify_change_request
  AFTER INSERT OR UPDATE ON public.order_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_change_request();

GRANT SELECT, INSERT, UPDATE ON public.order_change_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public._apply_order_edit(uuid, jsonb, jsonb)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_change_request(uuid, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order_change_request(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_change_request(uuid, text)           TO authenticated;
