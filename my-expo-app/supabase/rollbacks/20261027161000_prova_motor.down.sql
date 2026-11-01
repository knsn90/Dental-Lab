-- Geri alma: 20261027161000_prova_motor
-- Not: canlıda açık bir 'client_prova' beklemesi varsa önce kapatılmalı (resume_order eski hâline
-- dönünce onu da kapatabilir, teslim tarihini saat bazlı yuvarlamayla öteler).
drop trigger if exists trg_deliveries_prova_auto on public.deliveries;
drop trigger if exists trg_work_orders_prova_reopen on public.work_orders;
drop function if exists public.trg_deliveries_prova_fn();
drop function if exists public.trg_prova_reopen_fn();
drop function if exists public._prova_from_delivery(uuid);
drop function if exists public.prova_undo(uuid);
drop function if exists public.prova_set_note(uuid, text);
drop function if exists public.prova_client_returned(uuid);
drop function if exists public.prova_mark_returned(uuid, date, text);
drop function if exists public.prova_mark_sent(uuid, date);
drop function if exists public.prova_create(uuid, uuid, text, text);
drop function if exists public._prova_apply(uuid, text, date, text, text);
drop function if exists public._prova_order_state(uuid);
drop function if exists public._prova_hold_sync(uuid, date);

-- resume_order: 20261027161000 öncesi canlı tanım (.before.txt)
CREATE OR REPLACE FUNCTION public.resume_order(p_order uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_started timestamptz; v_resp text; v_days int;
BEGIN
  SELECT lab_id, hold_started_at, hold_responsible
    INTO v_lab, v_started, v_resp
  FROM work_orders WHERE id = p_order;

  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparisi devam ettirme yetkiniz yok';
  END IF;
  IF v_started IS NULL THEN RETURN 0; END IF;

  v_days := greatest(0, round(extract(epoch FROM (now() - v_started)) / 86400.0))::int;

  IF coalesce(v_resp,'client') = 'client' AND v_days > 0 THEN
    UPDATE work_orders SET delivery_date = delivery_date + v_days WHERE id = p_order;
  ELSE
    v_days := 0;
  END IF;

  UPDATE work_orders SET
    hold_status = NULL, hold_reason = NULL, hold_category = NULL,
    hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
  WHERE id = p_order;

  UPDATE work_order_holds SET
    ended_at = now(), extended_days = v_days, resumed_by = auth.uid()
  WHERE work_order_id = p_order AND ended_at IS NULL;

  RETURN v_days;
END $function$;
