-- Geri alma: 20261127140000_bbk_multi_drop
-- DİKKAT: çok noktalı satırlar varsa önce onları ele alın (ref kolonları silinir).
DROP FUNCTION IF EXISTS public.create_multi_drop_deliveries(text, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public.bbk_split_point_fee(text, numeric);
DROP FUNCTION IF EXISTS public.bbk_apply_point_proof(text, text, text, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.bbk_apply_point_status(text, delivery_status, timestamptz, text, text, text, text);

CREATE OR REPLACE FUNCTION public.bbk_apply_delivery_status(p_tracking_no text, p_status delivery_status, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if p_tracking_no is null or btrim(p_tracking_no) = '' then
    return jsonb_build_object('ok', false, 'reason', 'tracking_no_missing');
  end if;

  update public.deliveries
     set status       = p_status,
         picked_up_at = case when p_status='teslim_alindi' and picked_up_at is null then now() else picked_up_at end,
         delivered_at = case when p_status='teslim_edildi' and delivered_at is null then now() else delivered_at end,
         cancelled_at = case when p_status='iptal'         and cancelled_at is null then now() else cancelled_at end,
         cancel_reason= case when p_status='iptal' then coalesce(p_note, cancel_reason) else cancel_reason end
   where btrim(external_tracking_no) = btrim(p_tracking_no)
     and coalesce(external_provider,'') ilike '%banabikurye%'
     and status is distinct from p_status;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', true, 'changed', false, 'reason', 'no_matching_or_same_status');
  end if;
  return jsonb_build_object('ok', true, 'changed', true, 'rows', v_count, 'to', p_status::text);
end
$function$;

CREATE OR REPLACE FUNCTION public.bbk_apply_delivery_proof(p_tracking_no text, p_recipient_name text, p_recipient_title text, p_visit_at timestamp with time zone, p_place_photo_path text, p_sign_photo_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n     int;
  v_name  text := left(nullif(btrim(coalesce(p_recipient_name, '')), ''), 120);
  v_title text := left(nullif(btrim(coalesce(p_recipient_title, '')), ''), 120);
  v_place text := nullif(btrim(coalesce(p_place_photo_path, '')), '');
  v_sign  text := nullif(btrim(coalesce(p_sign_photo_path, '')), '');
  v_any   boolean;
begin
  if p_tracking_no is null or btrim(p_tracking_no) = '' then
    return jsonb_build_object('ok', false, 'reason', 'tracking_no_missing');
  end if;
  v_any := coalesce(v_name, v_title, v_place, v_sign) is not null;
  update public.deliveries
     set provider_proof_checked_at = now(),
         recipient_name    = coalesce(recipient_name, v_name),
         recipient_title   = coalesce(recipient_title, v_title),
         proof_photo_path  = coalesce(proof_photo_path, v_place),
         signature_path    = coalesce(signature_path, v_sign),
         proof_source      = case when v_any then coalesce(proof_source, 'provider') else proof_source end,
         proof_captured_at = case when v_any then coalesce(proof_captured_at, p_visit_at, now()) else proof_captured_at end
   where btrim(external_tracking_no) = btrim(p_tracking_no)
     and coalesce(external_provider, '') ilike '%banabikurye%'
     and status::text = 'teslim_edildi';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$function$;

DROP FUNCTION IF EXISTS public._bbk_status_rank(delivery_status);
DROP INDEX IF EXISTS public.uq_deliveries_external_point_ref;
DROP INDEX IF EXISTS public.idx_deliveries_external_tracking_no;
ALTER TABLE public.deliveries
  DROP COLUMN IF EXISTS external_point_ref,
  DROP COLUMN IF EXISTS external_point_id,
  DROP COLUMN IF EXISTS external_delivery_id;
