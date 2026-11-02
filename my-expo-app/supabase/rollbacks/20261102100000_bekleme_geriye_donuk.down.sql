-- GERİ ALMA: 20261102100000_bekleme_geriye_donuk → canlı tanım (.before.txt)
drop trigger if exists trg_wo_close_hold_on_delivery on public.work_orders;
drop function if exists public._close_open_holds_on_delivery();

drop function if exists public.hold_order(uuid, text, text, text, date);
drop function if exists public.resume_order(uuid, date, date);

CREATE OR REPLACE FUNCTION public.hold_order(p_order uuid, p_reason text, p_category text DEFAULT 'client_other'::text, p_responsible text DEFAULT 'client'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_resp text;
BEGIN
  SELECT lab_id INTO v_lab FROM work_orders WHERE id = p_order;
  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparisi bekletme yetkiniz yok';
  END IF;

  v_resp := CASE WHEN coalesce(p_responsible,'client') = 'lab' THEN 'lab' ELSE 'client' END;

  UPDATE work_orders SET
    hold_status      = 'on_hold',
    hold_reason      = nullif(btrim(p_reason), ''),
    hold_category    = p_category,
    hold_responsible = v_resp,
    hold_started_at  = now(),
    hold_by          = auth.uid()
  WHERE id = p_order
    AND hold_status IS DISTINCT FROM 'on_hold';

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO work_order_holds(work_order_id, lab_id, reason, category, responsible, started_at, held_by)
  VALUES (p_order, v_lab, nullif(btrim(p_reason), ''), p_category, v_resp, now(), auth.uid());
END $function$;

revoke all on function public.hold_order(uuid, text, text, text) from public, anon;
grant execute on function public.hold_order(uuid, text, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resume_order(p_order uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid; v_started timestamptz; v_resp text; v_days int; v_cat text; v_open uuid[];
BEGIN
  SELECT lab_id, hold_started_at, hold_responsible, hold_category
    INTO v_lab, v_started, v_resp, v_cat
  FROM work_orders WHERE id = p_order;

  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparisi devam ettirme yetkiniz yok';
  END IF;
  -- 20261027161000: prova beklemesi yalnız prova akışıyla (dönüş işareti) kapanır
  IF v_cat = 'client_prova' THEN
    RAISE EXCEPTION 'Prova beklemesi prova akışıyla kapanır' USING errcode = 'P0001';
  END IF;
  IF v_started IS NULL THEN RETURN 0; END IF;
  -- 20261027165000: yalnız ŞU AN açık olan bekleme satır(lar)ı kapanır; aşağıdaki UPDATE'in tetiklediği
  -- prova beklemesi (trg_work_orders_prova_reopen) yeni satır açarsa o satıra dokunulmaz.
  SELECT coalesce(array_agg(id), '{}') INTO v_open FROM work_order_holds WHERE work_order_id = p_order AND ended_at IS NULL;

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
  WHERE id = ANY(v_open);

  RETURN v_days;
END $function$;

revoke all on function public.resume_order(uuid) from public, anon;
grant execute on function public.resume_order(uuid) to authenticated, service_role;

alter table public.work_order_holds
  drop column if exists end_source,
  drop column if exists end_recorded_at;
