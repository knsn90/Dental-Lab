-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-fill lab_id on clinic-side writes to work_orders / work_order_photos /
-- order_messages.
--
-- PROBLEM
--   When a clinic_admin (whose profiles.lab_id is NULL) creates an order on
--   behalf of a doctor, the front-end inserts rows with lab_id = NULL.
--   Lab-side RLS policies (`photos_select_lab`, `order_messages_lab`) require
--   `lab_id = get_my_lab_id()`, so the lab manager panel can't read those
--   photos/messages — TriageModal preview is empty (doctor notes/messages/
--   uploaded files), and messages don't show up in the inbox panel.
--
-- FIX
--   1) Backfill lab_id on existing rows where it's NULL, using the chain
--      work_order.doctor_id → (profiles or doctors).clinic_id → clinics.lab_id.
--      For photos/messages also fall back to work_orders.lab_id.
--   2) Add BEFORE INSERT triggers that auto-populate lab_id when NULL,
--      so future inserts always have a lab_id even from clinic_admin clients.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: resolve lab_id from a work_orders row
CREATE OR REPLACE FUNCTION public.resolve_lab_id_for_order(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    wo.lab_id,
    (
      SELECT c.lab_id
      FROM profiles p
      JOIN clinics  c ON c.id = p.clinic_id
      WHERE p.id = wo.doctor_id
    ),
    (
      SELECT c.lab_id
      FROM doctors d
      JOIN clinics c ON c.id = d.clinic_id
      WHERE d.id = wo.doctor_id
    )
  )
  FROM work_orders wo
  WHERE wo.id = p_order_id;
$$;

-- Helper: resolve lab_id from a doctor_id (used by work_orders trigger)
CREATE OR REPLACE FUNCTION public.resolve_lab_id_for_doctor(p_doctor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.lab_id FROM profiles p JOIN clinics c ON c.id = p.clinic_id WHERE p.id = p_doctor_id),
    (SELECT c.lab_id FROM doctors  d JOIN clinics c ON c.id = d.clinic_id WHERE d.id = p_doctor_id)
  );
$$;

-- ─── 1) BACKFILL existing rows ───────────────────────────────────────────────

UPDATE work_orders wo
   SET lab_id = COALESCE(
     (SELECT c.lab_id FROM profiles p JOIN clinics c ON c.id = p.clinic_id WHERE p.id = wo.doctor_id),
     (SELECT c.lab_id FROM doctors  d JOIN clinics c ON c.id = d.clinic_id WHERE d.id = wo.doctor_id)
   )
 WHERE wo.lab_id IS NULL;

UPDATE work_order_photos wp
   SET lab_id = (SELECT wo.lab_id FROM work_orders wo WHERE wo.id = wp.work_order_id)
 WHERE wp.lab_id IS NULL;

UPDATE order_messages om
   SET lab_id = (SELECT wo.lab_id FROM work_orders wo WHERE wo.id = om.work_order_id)
 WHERE om.lab_id IS NULL;

-- ─── 2) TRIGGERS for future inserts ──────────────────────────────────────────

-- work_orders: derive lab_id from doctor's clinic when null
CREATE OR REPLACE FUNCTION public.tg_work_orders_autofill_lab_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lab_id IS NULL AND NEW.doctor_id IS NOT NULL THEN
    NEW.lab_id := public.resolve_lab_id_for_doctor(NEW.doctor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_autofill_lab_id ON public.work_orders;
CREATE TRIGGER work_orders_autofill_lab_id
BEFORE INSERT ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_work_orders_autofill_lab_id();

-- work_order_photos: derive lab_id from work_orders.lab_id when null
CREATE OR REPLACE FUNCTION public.tg_work_order_photos_autofill_lab_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lab_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    NEW.lab_id := public.resolve_lab_id_for_order(NEW.work_order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_order_photos_autofill_lab_id ON public.work_order_photos;
CREATE TRIGGER work_order_photos_autofill_lab_id
BEFORE INSERT ON public.work_order_photos
FOR EACH ROW EXECUTE FUNCTION public.tg_work_order_photos_autofill_lab_id();

-- order_messages: derive lab_id from work_orders.lab_id when null
CREATE OR REPLACE FUNCTION public.tg_order_messages_autofill_lab_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lab_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    NEW.lab_id := public.resolve_lab_id_for_order(NEW.work_order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_messages_autofill_lab_id ON public.order_messages;
CREATE TRIGGER order_messages_autofill_lab_id
BEFORE INSERT ON public.order_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_order_messages_autofill_lab_id();
