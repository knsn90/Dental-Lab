-- 20260720140000 — Revizyon siparişi (teslim sonrası yeniden yapım)
-- ─────────────────────────────────────────────────────────────────────────────
-- SENARYO: İş hekime teslim edildi, hekim revize istedi; iş baştan (farklı
-- şekilde) yapılacak.
--
-- KARAR (kullanıcı): Orijinal sipariş DOKUNULMADAN kapalı kalır; revizyon
-- BAĞLI YENİ SİPARİŞ olarak açılır. Sebep: teslim tarihi, kurye kaydı, fatura
-- ve SLA/gecikme istatistikleri geçmişe aittir — orijinali yeniden açmak
-- "zamanında teslim" oranını ve siparişin kendi geçmişini bozar.
--
-- FİYAT: Revizyon açılırken SORUMLULUK sorulur.
--   'lab'    → lab hatası/garanti  → kalem fiyatları 0
--   'client' → hekim değişikliği   → orijinal fiyatlar kopyalanır
-- Bu alan aynı zamanda "yeniden-yapım oranı" KPI'ının kaynağıdır.
-- (hold_responsible'daki 'lab'/'client' deseniyle tutarlı.)
--
-- KAPSAM: Üretim SIRASINDAKİ değişiklikler bu akışa girmez — onlar
-- order_change_requests (hekim talebi) ve return_to_stage (QC reddi) ile
-- yönetilir. Bu RPC yalnız TESLİM EDİLMİŞ siparişte çalışır.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Şema (additive) ───────────────────────────────────────────────────────
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS revision_of_id       uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_no          integer,
  ADD COLUMN IF NOT EXISTS revision_reason      text,
  ADD COLUMN IF NOT EXISTS revision_responsible text;

DO $$ BEGIN
  ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_revision_responsible_chk
    CHECK (revision_responsible IS NULL OR revision_responsible IN ('lab','client'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_revision_pair_chk
    CHECK ((revision_of_id IS NULL) = (revision_no IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS work_orders_revision_of_idx
  ON public.work_orders(revision_of_id) WHERE revision_of_id IS NOT NULL;

COMMENT ON COLUMN public.work_orders.revision_of_id IS
  'Bu sipariş hangi siparişin revizyonu (zincir: revizyonun revizyonu bir öncekini gösterir).';
COMMENT ON COLUMN public.work_orders.revision_responsible IS
  'lab = garanti/ücretsiz yeniden yapım · client = hekim kaynaklı değişiklik (ücretli).';

-- ── 2) RPC — revizyon siparişi oluştur ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_revision_order(
  p_order_id      uuid,
  p_reason        text,
  p_responsible   text,
  p_delivery_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_user_type text;
  v_role      text;
  v_src       public.work_orders%ROWTYPE;
  v_new_id    uuid;
  v_free      boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF p_responsible IS NULL OR p_responsible NOT IN ('lab','client') THEN
    RAISE EXCEPTION 'Sorumluluk secilmeli: lab veya client';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Revizyon sebebi zorunlu';
  END IF;

  -- Yetki: lab yöneticisi / admin
  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_src FROM public.work_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  -- Tenant izolasyonu: kendi labının siparişi olmalı
  IF v_user_type <> 'admin' AND v_src.lab_id IS DISTINCT FROM public.get_my_lab_id() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Yalnız teslim edilmiş siparişte. Üretim sırasındaki değişiklikler
  -- order_change_requests / return_to_stage ile yönetilir.
  IF v_src.status <> 'teslim_edildi' THEN
    RAISE EXCEPTION 'Revizyon yalnizca teslim edilmis siparis icin acilabilir (mevcut: %)', v_src.status;
  END IF;

  v_free := (p_responsible = 'lab');

  INSERT INTO public.work_orders (
    lab_id, doctor_id, doctors_id,
    patient_name, patient_id, patient_gender, patient_dob,
    patient_nationality, patient_country, patient_city,
    tooth_numbers, work_type, shade, machine_type, model_type,
    measurement_type, input_type, department, tags, complexity,
    notes, delivery_method, priority, is_urgent,
    requires_design_approval, doctor_approval_required,
    delivery_date, status,
    revision_of_id, revision_no, revision_reason, revision_responsible
  ) VALUES (
    v_src.lab_id, v_src.doctor_id, v_src.doctors_id,
    v_src.patient_name, v_src.patient_id, v_src.patient_gender, v_src.patient_dob,
    v_src.patient_nationality, v_src.patient_country, v_src.patient_city,
    v_src.tooth_numbers, v_src.work_type, v_src.shade, v_src.machine_type, v_src.model_type,
    v_src.measurement_type, v_src.input_type, v_src.department, v_src.tags, v_src.complexity,
    v_src.notes, v_src.delivery_method, v_src.priority, v_src.is_urgent,
    v_src.requires_design_approval, v_src.doctor_approval_required,
    COALESCE(p_delivery_date, CURRENT_DATE + 7), 'alindi',
    p_order_id, COALESCE(v_src.revision_no, 0) + 1, trim(p_reason), p_responsible
  )
  RETURNING id INTO v_new_id;

  -- Kalemleri kopyala. Lab kaynaklı (garanti) ise fiyat 0.
  INSERT INTO public.order_items (
    work_order_id, lab_id, service_id, name, quantity, notes,
    tooth_numbers, lane, price, price_was_overridden
  )
  SELECT v_new_id, oi.lab_id, oi.service_id, oi.name, oi.quantity, oi.notes,
         oi.tooth_numbers, oi.lane,
         CASE WHEN v_free THEN 0 ELSE oi.price END,
         CASE WHEN v_free THEN TRUE ELSE oi.price_was_overridden END
  FROM public.order_items oi
  WHERE oi.work_order_id = p_order_id;

  -- Orijinalin yeniden-yapım sayacı
  UPDATE public.work_orders SET rework_count = COALESCE(rework_count, 0) + 1
   WHERE id = p_order_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_revision_order(uuid, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_revision_order(uuid, text, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
