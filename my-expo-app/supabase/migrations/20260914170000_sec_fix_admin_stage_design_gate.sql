-- =====================================================================
-- STAGE 02.2-EMERGENCY — H-2: design-approval gate bypass via admin_complete_stage / admin_skip_stage.
-- Also adds explicit tenant binding (assert_my_stage) to these two RPCs as defense-in-depth for C-1.
--
-- ROOT CAUSE: admin_complete_stage/admin_skip_stage (manager "override" RPCs) completed/skipped a
-- DESIGN stage without checking the doctor's design approval — unlike complete_stage_simple which
-- holds at 'tasarim_onayi_bekleniyor' until approved. There is a dedicated explicit override
-- (admin_force_design_approval), so the implicit bypass is a gap, not intended.
--
-- FIX: mirror complete_stage_simple's design gate in both admin RPCs — a DESIGN stage that requires
-- an unapproved doctor approval is HELD (status → tasarim_onayi_bekleniyor, token issued), not
-- advanced. A manager who legitimately overrides uses admin_force_design_approval first.
-- Bodies below are the originals + (assert_my_stage tenant bind) + (design gate); nothing else changed.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_complete_stage(p_stage_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_wo UUID; v_seq INT; v_status stage_status;
  v_station UUID; v_kind TEXT; v_req BOOLEAN; v_stat TEXT;
BEGIN
  PERFORM public._assert_stage_manager();
  PERFORM public.assert_my_stage(p_stage_id);   -- C-1 defense-in-depth: target stage must be caller's tenant
  SELECT work_order_id, sequence_order, status, station_id
    INTO v_wo, v_seq, v_status, v_station
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status IN ('tamamlandi','onaylandi') THEN RETURN TRUE; END IF;

  -- H-2 design-approval gate
  v_kind := public._stage_for_station(v_station);
  SELECT doctor_approval_required, doctor_approval_status INTO v_req, v_stat
    FROM public.work_orders WHERE id = v_wo;
  IF v_kind = 'DESIGN' AND COALESCE(v_req, FALSE) = TRUE AND COALESCE(v_stat,'') NOT IN ('approved') THEN
    UPDATE public.work_orders
       SET doctor_approval_status = 'pending', doctor_approval_required = TRUE,
           status = 'tasarim_onayi_bekleniyor', current_stage_id = NULL
     WHERE id = v_wo;
    BEGIN PERFORM public.generate_doctor_approval_token(v_wo); EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN TRUE;   -- held for design approval; NOT advanced
  END IF;

  IF v_status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden') THEN
    UPDATE public.order_stages
       SET status='aktif', technician_id=COALESCE(technician_id,v_caller),
           assigned_at=COALESCE(assigned_at,NOW()), started_at=COALESCE(started_at,NOW())
     WHERE id=p_stage_id;
  END IF;
  UPDATE public.order_stages
     SET status='tamamlandi', technician_id=COALESCE(technician_id,v_caller),
         assigned_at=COALESCE(assigned_at,NOW()), started_at=COALESCE(started_at,NOW()), completed_at=NOW()
   WHERE id=p_stage_id;
  UPDATE public.work_orders SET current_stage_id=NULL WHERE id=v_wo AND current_stage_id=p_stage_id;
  PERFORM public._advance_after_stage(v_wo, v_seq, v_caller);
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_skip_stage(p_stage_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_wo UUID; v_seq INT; v_status stage_status;
  v_station UUID; v_kind TEXT; v_req BOOLEAN; v_stat TEXT;
BEGIN
  PERFORM public._assert_stage_manager();
  PERFORM public.assert_my_stage(p_stage_id);   -- C-1 defense-in-depth
  SELECT work_order_id, sequence_order, status, station_id
    INTO v_wo, v_seq, v_status, v_station
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status IN ('tamamlandi','onaylandi','skipped') THEN RETURN TRUE; END IF;

  -- H-2 design-approval gate (a required, unapproved DESIGN stage cannot be skipped past)
  v_kind := public._stage_for_station(v_station);
  SELECT doctor_approval_required, doctor_approval_status INTO v_req, v_stat
    FROM public.work_orders WHERE id = v_wo;
  IF v_kind = 'DESIGN' AND COALESCE(v_req, FALSE) = TRUE AND COALESCE(v_stat,'') NOT IN ('approved') THEN
    UPDATE public.work_orders
       SET doctor_approval_status = 'pending', doctor_approval_required = TRUE,
           status = 'tasarim_onayi_bekleniyor', current_stage_id = NULL
     WHERE id = v_wo;
    BEGIN PERFORM public.generate_doctor_approval_token(v_wo); EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN TRUE;
  END IF;

  UPDATE public.order_stages
     SET status='skipped',
         skipped_reason = COALESCE(NULLIF(trim(skipped_reason), ''), 'Yönetici tarafından atlandı'),
         skipped_at = NOW(), skipped_by = v_caller
   WHERE id = p_stage_id;
  UPDATE public.work_orders SET current_stage_id=NULL WHERE id=v_wo AND current_stage_id=p_stage_id;
  PERFORM public._advance_after_stage(v_wo, v_seq, v_caller);
  RETURN TRUE;
END; $function$;

COMMIT;
