-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 — Design → Üretim arası hekim onay GATE
--
-- work_orders.doctor_approval_required = TRUE olan iş emirlerinde:
--   1) DESIGN (tasarım) aşaması tamamlandığında bir sonraki üretim aşaması
--      AKTİVE EDİLMEZ. Onun yerine:
--        • work_orders.doctor_approval_status = 'pending'
--        • work_orders.status                 = 'tasarim_onayi_bekleniyor'
--      ve hekim + klinik admin/sekreter'lerine bildirim gider.
--
--   2) clinic_decide_design_approval(wo_id, approved) RPC'si ile
--      hekim/klinik bu kararı verir (RLS ile kendi siparişlerinde).
--      onaylanırsa: bir sonraki aşama aktif edilir.
--      reddedilirse: DESIGN aşaması tekrar 'aktif'e döner.
--
--   3) admin_force_design_approval(wo_id) — sadece admin/lab manager.
--      "zorunlu hallerde" üretime devam eder, decision_by + at saklanır.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) status enum'a yeni değer (varsa skip)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'work_order_status' AND e.enumlabel = 'tasarim_onayi_bekleniyor'
  ) THEN
    -- status sütunu TEXT olabilir, enum olabilir — TEXT ise CHECK constraint yok demektir
    -- Hata olursa loglayıp devam edeceğiz
    BEGIN
      ALTER TYPE work_order_status ADD VALUE 'tasarim_onayi_bekleniyor';
    EXCEPTION WHEN undefined_object THEN
      -- enum yoksa sorun değil, status sütunu zaten TEXT'tir
      NULL;
    END;
  END IF;
END $$;

-- 2) complete_stage_simple — DESIGN sonrası approval gate
CREATE OR REPLACE FUNCTION public.complete_stage_simple(
  p_stage_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller         UUID := auth.uid();
  v_stage_tech     UUID; v_status stage_status;
  v_user_type      TEXT; v_role TEXT;
  v_work_order_id  UUID; v_seq INT; v_next_id UUID; v_next_seq INT;
  v_auto_prog      BOOLEAN;
  v_safety_loop    INT := 0;
  v_station_id     UUID;
  v_stage_kind     TEXT;
  v_approval_req   BOOLEAN;
  v_approval_stat  TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT technician_id, status, work_order_id, sequence_order, station_id
    INTO v_stage_tech, v_status, v_work_order_id, v_seq, v_station_id
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF v_stage_tech <> v_caller AND NOT (v_user_type='admin')
     AND NOT (v_user_type='lab' AND v_role IN ('manager','admin'))
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_status <> 'aktif' THEN
    RAISE EXCEPTION 'stage must be aktif (current: %)', v_status;
  END IF;

  -- Tamamla
  UPDATE public.order_stages
     SET status='tamamlandi', completed_at=NOW()
   WHERE id = p_stage_id;

  -- ─── DESIGN approval gate ───────────────────────────────────────────────
  v_stage_kind := _stage_for_station(v_station_id);

  SELECT doctor_approval_required, doctor_approval_status
    INTO v_approval_req, v_approval_stat
    FROM public.work_orders WHERE id = v_work_order_id;

  IF v_stage_kind = 'DESIGN'
     AND COALESCE(v_approval_req, FALSE) = TRUE
     AND COALESCE(v_approval_stat, '') NOT IN ('approved')
  THEN
    -- Sonraki aşamaya geçmek YERİNE onay bekle
    UPDATE public.work_orders
       SET doctor_approval_status = 'pending',
           doctor_approval_required = TRUE,
           status                 = 'tasarim_onayi_bekleniyor',
           current_stage_id       = NULL
     WHERE id = v_work_order_id;

    -- Token üret (mevcut akış için)
    BEGIN
      PERFORM generate_doctor_approval_token(v_work_order_id);
    EXCEPTION WHEN OTHERS THEN
      -- token üretimi başarısız olursa devam et — RPC ile onay yine de mümkün
      NULL;
    END;
    RETURN TRUE;
  END IF;

  -- ─── Normal akış: sonraki bekleyen aşamaya geç ──────────────────────────
  v_next_seq := v_seq;

  LOOP
    v_safety_loop := v_safety_loop + 1;
    EXIT WHEN v_safety_loop > 20;

    SELECT os.id, ls.auto_progress, os.sequence_order
      INTO v_next_id, v_auto_prog, v_next_seq
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.work_order_id = v_work_order_id
       AND os.sequence_order > v_next_seq
       AND os.status = 'bekliyor'
     ORDER BY os.sequence_order
     LIMIT 1;

    EXIT WHEN v_next_id IS NULL;

    IF v_auto_prog THEN
      UPDATE public.order_stages
         SET status='tamamlandi',
             technician_id = COALESCE(technician_id, v_caller),
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at=COALESCE(started_at, NOW()),
             completed_at=NOW()
       WHERE id = v_next_id;
    ELSE
      UPDATE public.order_stages
         SET status='aktif',
             assigned_at=COALESCE(assigned_at, NOW()),
             started_at = NULL
       WHERE id = v_next_id;
      UPDATE public.work_orders
         SET current_stage_id = v_next_id,
             status = 'asamada'
       WHERE id = v_work_order_id;
      RETURN TRUE;
    END IF;
  END LOOP;

  -- Tüm aşamalar bitti
  UPDATE public.work_orders
     SET current_stage_id = NULL, status = 'teslimata_hazir'
   WHERE id = v_work_order_id;
  RETURN TRUE;
END;
$$;

-- 3) Sonraki stage aktivasyon yardımcısı — onay sonrası kullanılır
CREATE OR REPLACE FUNCTION public._activate_next_pending_stage(p_work_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_id UUID;
BEGIN
  SELECT id INTO v_next_id
    FROM public.order_stages
   WHERE work_order_id = p_work_order_id
     AND status = 'bekliyor'
   ORDER BY sequence_order
   LIMIT 1;

  IF v_next_id IS NULL THEN
    UPDATE public.work_orders
       SET current_stage_id = NULL,
           status = 'teslimata_hazir'
     WHERE id = p_work_order_id;
    RETURN TRUE;
  END IF;

  UPDATE public.order_stages
     SET status = 'aktif',
         assigned_at = COALESCE(assigned_at, NOW()),
         started_at = NULL
   WHERE id = v_next_id;

  UPDATE public.work_orders
     SET current_stage_id = v_next_id,
         status = 'asamada'
   WHERE id = p_work_order_id;

  RETURN TRUE;
END;
$$;

-- 4) Hekim/klinik karar RPC'si (giriş yapan kullanıcı için RLS — kendi siparişi)
CREATE OR REPLACE FUNCTION public.clinic_decide_design_approval(
  p_work_order_id UUID,
  p_approved      BOOLEAN,
  p_note          TEXT DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT;
  v_clinic_id UUID;
  v_doc_id    UUID;
  v_wo_clinic UUID;
  v_wo_status TEXT;
  v_design_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, clinic_id INTO v_user_type, v_clinic_id
    FROM public.profiles WHERE id = v_caller;

  SELECT doctor_id, doctor_approval_status, status
    INTO v_doc_id, v_wo_status, v_wo_status
    FROM public.work_orders WHERE id = p_work_order_id;
  IF v_doc_id IS NULL THEN RAISE EXCEPTION 'work order not found'; END IF;

  -- Yetki kontrolü
  v_wo_clinic := public._resolve_wo_clinic_id(p_work_order_id);
  IF v_user_type = 'doctor' THEN
    IF v_doc_id <> v_caller THEN RAISE EXCEPTION 'forbidden — not your order'; END IF;
  ELSIF v_user_type IN ('clinic_admin', 'clinic_secretary') THEN
    IF v_clinic_id IS NULL OR v_clinic_id <> v_wo_clinic THEN
      RAISE EXCEPTION 'forbidden — not your clinic';
    END IF;
  ELSE
    RAISE EXCEPTION 'forbidden — only doctor / clinic user can decide';
  END IF;

  -- Karar uygula
  UPDATE public.work_orders
     SET doctor_approval_status     = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
         doctor_approval_token      = NULL,
         doctor_approval_decided_by = v_caller,
         doctor_approval_decided_at = NOW()
   WHERE id = p_work_order_id;

  -- design_qc_checks kaydı varsa güncelle
  UPDATE design_qc_checks
     SET doctor_approved = p_approved,
         doctor_approved_at = NOW(),
         doctor_note = p_note
   WHERE work_order_id = p_work_order_id;

  IF p_approved THEN
    PERFORM public._activate_next_pending_stage(p_work_order_id);
  ELSE
    -- DESIGN aşamasını tekrar aktife al, rework_count++
    SELECT id INTO v_design_id FROM public.order_stages
     WHERE work_order_id = p_work_order_id
       AND status IN ('tamamlandi', 'onaylandi')
     ORDER BY sequence_order DESC LIMIT 1;

    IF v_design_id IS NOT NULL THEN
      UPDATE public.order_stages
         SET status='aktif', completed_at=NULL, started_at=NULL
       WHERE id = v_design_id;
      UPDATE public.work_orders
         SET status='asamada',
             current_stage_id = v_design_id,
             rework_count = COALESCE(rework_count, 0) + 1
       WHERE id = p_work_order_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'approved', p_approved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clinic_decide_design_approval(UUID, BOOLEAN, TEXT) TO authenticated;

-- 5) Admin override — zorunlu hallerde
CREATE OR REPLACE FUNCTION public.admin_force_design_approval(
  p_work_order_id UUID,
  p_note          TEXT DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT;
  v_role      TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role
    FROM public.profiles WHERE id = v_caller;

  IF v_user_type NOT IN ('admin') AND NOT (v_user_type='lab' AND v_role IN ('manager','admin')) THEN
    RAISE EXCEPTION 'forbidden — admin / lab manager only';
  END IF;

  UPDATE public.work_orders
     SET doctor_approval_status     = 'approved',
         doctor_approval_token      = NULL,
         doctor_approval_decided_by = v_caller,
         doctor_approval_decided_at = NOW(),
         doctor_approval_admin_override = TRUE
   WHERE id = p_work_order_id;

  PERFORM public._activate_next_pending_stage(p_work_order_id);

  RETURN jsonb_build_object('ok', TRUE, 'override', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_design_approval(UUID, TEXT) TO authenticated;

-- 6) work_orders'a karar metadata kolonları (varsa skip)
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS doctor_approval_decided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS doctor_approval_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doctor_approval_admin_override BOOLEAN DEFAULT FALSE;

-- 7) Bildirim — onay beklemeye geçen siparişler için hekim + klinik admin/sekreter
CREATE OR REPLACE FUNCTION public.trg_notify_design_approval_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_num TEXT;
  v_clinic_id UUID;
  v_member    RECORD;
BEGIN
  -- Sadece 'pending'e yeni geçildiğinde
  IF NEW.doctor_approval_status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  IF OLD.doctor_approval_status IS NOT DISTINCT FROM 'pending' THEN RETURN NEW; END IF;

  v_order_num := NEW.order_number;
  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);

  -- Hekim
  IF NEW.doctor_id IS NOT NULL THEN
    PERFORM public._notify_dedup(
      NEW.doctor_id,
      'approval',
      'Tasarım onayı bekliyor',
      '#' || COALESCE(v_order_num, '?') || ' · Üretim için onayınız gerekli',
      'work_order',
      NEW.id,
      '/(doctor)/order/' || NEW.id::text,
      jsonb_build_object('reason', 'design_approval')
    );
  END IF;

  -- Klinik admin + sekreter
  IF v_clinic_id IS NOT NULL THEN
    FOR v_member IN
      SELECT id FROM public.profiles
       WHERE clinic_id = v_clinic_id
         AND user_type IN ('clinic_admin', 'clinic_secretary')
         AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public._notify_dedup(
        v_member.id,
        'approval',
        'Tasarım onayı bekliyor',
        '#' || COALESCE(v_order_num, '?') || ' · Hekim onayı bekleniyor',
        'work_order',
        NEW.id,
        '/(clinic)/order/' || NEW.id::text,
        jsonb_build_object('reason', 'design_approval')
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_notify_design_approval ON public.work_orders;
CREATE TRIGGER work_orders_notify_design_approval
  AFTER UPDATE OF doctor_approval_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_design_approval_pending();

COMMIT;

NOTIFY pgrst, 'reload schema';
