-- Sipariş iptal talebi: klinik/hekim oluşturur, admin + mesul müdür (lab manager) onaylar.
-- Onaylanınca yumuşak iptal (work_orders.status = 'iptal'); kayıt korunur.

-- 1) Yumuşak iptal için enum değeri
ALTER TYPE public.work_order_status ADD VALUE IF NOT EXISTS 'iptal';

-- 2) Talep tablosu
CREATE TABLE IF NOT EXISTS public.order_cancellation_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lab_id         uuid,
  requested_by   uuid NOT NULL,
  requester_name text,
  reason_code    text NOT NULL,
  reason_detail  text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ocr_pending
  ON public.order_cancellation_requests(work_order_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ocr_status
  ON public.order_cancellation_requests(status, created_at DESC);

ALTER TABLE public.order_cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Onaylayıcı = admin veya lab mesul müdür (role='manager')
CREATE OR REPLACE FUNCTION public.is_cancel_approver() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS ocr_insert ON public.order_cancellation_requests;
CREATE POLICY ocr_insert ON public.order_cancellation_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS ocr_select ON public.order_cancellation_requests;
CREATE POLICY ocr_select ON public.order_cancellation_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_cancel_approver());

DROP POLICY IF EXISTS ocr_update ON public.order_cancellation_requests;
CREATE POLICY ocr_update ON public.order_cancellation_requests
  FOR UPDATE TO authenticated
  USING (public.is_cancel_approver()) WITH CHECK (public.is_cancel_approver());

-- 3) Bildirim trigger'ı (SECURITY DEFINER → RLS aşılır)
CREATE OR REPLACE FUNCTION public.notify_cancel_request() RETURNS trigger AS $$
DECLARE ord_no text;
BEGIN
  SELECT order_number::text INTO ord_no FROM public.work_orders WHERE id = NEW.work_order_id;
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id)
    SELECT p.id, NEW.lab_id, 'cancel_request', 'Sipariş iptal talebi',
           'Sipariş #' || COALESCE(ord_no, '') || ' için iptal talebi geldi.',
           'work_order', NEW.work_order_id
    FROM public.profiles p
    WHERE (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
      AND (NEW.lab_id IS NULL OR p.lab_id = NEW.lab_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('approved','rejected')) THEN
    INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id)
    VALUES (NEW.requested_by, NEW.lab_id, 'cancel_request',
            CASE WHEN NEW.status = 'approved' THEN 'İptal talebin onaylandı' ELSE 'İptal talebin reddedildi' END,
            CASE WHEN NEW.status = 'approved'
                 THEN 'Sipariş #' || COALESCE(ord_no, '') || ' iptal edildi.'
                 ELSE COALESCE(NEW.review_note, 'İptal talebin reddedildi.') END,
            'work_order', NEW.work_order_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_cancel_request ON public.order_cancellation_requests;
CREATE TRIGGER trg_notify_cancel_request
  AFTER INSERT OR UPDATE ON public.order_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_cancel_request();

GRANT SELECT, INSERT, UPDATE ON public.order_cancellation_requests TO authenticated;
