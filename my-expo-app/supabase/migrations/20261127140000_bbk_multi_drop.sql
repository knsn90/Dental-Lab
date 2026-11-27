-- BanaBiKurye çok noktalı teslimat (multi-drop) — Faz 2 arka uç.
--
-- Tek BBK siparişi: 1 alım (lab) + N teslim noktası. Her teslim noktası bizde AYRI
-- bir deliveries satırıdır ve kendi nokta kimliğini taşır:
--   external_point_ref   = bizim ürettiğimiz client_order_id (32 hex). BBK bunu
--                          bildirimlerde geri yollar → satır eşleme ANAHTARI.
--   external_point_id    = BBK point_id (nokta iptali / edit-order için)
--   external_delivery_id = BBK delivery_id
--
-- KURAL: ref'li satırlar sipariş düzeyindeki yoldan (bbk_apply_delivery_status /
-- bbk_apply_delivery_proof) İZOLE edilir. Aksi hâlde 1. nokta teslim edilmişken
-- sipariş hâlâ 'active' olduğundan gelen bir order_changed bildirimi TÜM satırları
-- 'yolda'ya çekip teslim edilmiş noktayı geri alırdı. Tek istisna: siparişin tamamı
-- iptal edilince (henüz teslim edilmemiş) ref'li satırlar da iptal olur.
-- Ref'siz satırlar (bugünkü tek noktalı ve "aynı kuryeyle" grupları) birebir eskisi gibi.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS external_point_ref   text,
  ADD COLUMN IF NOT EXISTS external_point_id    text,
  ADD COLUMN IF NOT EXISTS external_delivery_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_external_point_ref
  ON public.deliveries (external_point_ref) WHERE external_point_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_external_tracking_no
  ON public.deliveries (external_tracking_no) WHERE external_tracking_no IS NOT NULL;

-- ── Durum sırası: yalnız İLERİ gidilir; terminal durumdan çıkılmaz ─────────────
CREATE OR REPLACE FUNCTION public._bbk_status_rank(p delivery_status)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p::text
    WHEN 'beklemede'     THEN 0
    WHEN 'atandi'        THEN 1
    WHEN 'teslim_alindi' THEN 2
    WHEN 'yolda'         THEN 3
    ELSE 10              -- teslim_edildi / iade / iptal: terminal
  END
$$;

-- ── Sipariş düzeyi: ref'li satırları atla (iptal hariç) ────────────────────────
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
     and status is distinct from p_status
     -- Çok noktalı satırlar nokta bazında güncellenir (bbk_apply_point_status).
     -- Siparişin tamamı iptal edilirse teslim edilmemiş noktalar da iptal olur.
     and (external_point_ref is null
          or (p_status = 'iptal' and status not in ('teslim_edildi','iade','iptal')));
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
     and status::text = 'teslim_edildi'
     -- Çok noktalı: her noktanın kanıtı kendi satırına (bbk_apply_point_proof).
     and external_point_ref is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$function$;

-- ── Nokta düzeyi durum (yalnız service_role) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.bbk_apply_point_status(
  p_ref          text,
  p_status       delivery_status,
  p_at           timestamptz DEFAULT NULL,
  p_point_id     text DEFAULT NULL,
  p_delivery_id  text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_note         text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id   uuid;
  v_cur  delivery_status;
  v_at   timestamptz := coalesce(p_at, now());
  v_move boolean;
begin
  if p_ref is null or btrim(p_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'ref_missing');
  end if;

  select id, status into v_id, v_cur
    from public.deliveries
   where external_point_ref = btrim(p_ref)
     and coalesce(external_provider,'') ilike '%banabikurye%'
   for update;
  if v_id is null then
    return jsonb_build_object('ok', true, 'changed', false, 'reason', 'not_found');
  end if;

  -- İleri-yalnız: terminalden çıkılmaz, geri gidilmez.
  v_move := public._bbk_status_rank(v_cur) < 10
            and public._bbk_status_rank(p_status) > public._bbk_status_rank(v_cur);

  update public.deliveries
     set status        = case when v_move then p_status else status end,
         picked_up_at  = case when v_move and p_status in ('teslim_alindi','yolda','teslim_edildi') and picked_up_at is null
                              then v_at else picked_up_at end,
         delivered_at  = case when v_move and p_status = 'teslim_edildi' and delivered_at is null then v_at else delivered_at end,
         cancelled_at  = case when v_move and p_status = 'iptal' and cancelled_at is null then now() else cancelled_at end,
         cancel_reason = case when v_move and p_status = 'iptal' then coalesce(p_note, cancel_reason) else cancel_reason end,
         external_point_id     = coalesce(external_point_id, nullif(btrim(coalesce(p_point_id,'')), '')),
         external_delivery_id  = coalesce(external_delivery_id, nullif(btrim(coalesce(p_delivery_id,'')), '')),
         external_tracking_url = coalesce(external_tracking_url, nullif(btrim(coalesce(p_tracking_url,'')), ''))
   where id = v_id;

  return jsonb_build_object('ok', true, 'changed', v_move, 'id', v_id,
                            'from', v_cur::text, 'to', case when v_move then p_status::text else v_cur::text end);
end
$function$;

-- ── Nokta düzeyi teslim kanıtı (yalnız service_role) ──────────────────────────
CREATE OR REPLACE FUNCTION public.bbk_apply_point_proof(p_ref text, p_recipient_name text, p_recipient_title text, p_visit_at timestamp with time zone, p_place_photo_path text, p_sign_photo_path text)
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
  if p_ref is null or btrim(p_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'ref_missing');
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
   where external_point_ref = btrim(p_ref)
     and coalesce(external_provider, '') ilike '%banabikurye%'
     and status::text = 'teslim_edildi';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$function$;

-- ── Ücreti eşit böl (kuruş farkı son satıra; toplam birebir) ─────────────────
-- İptal edilmemiş ref'li satırlara yeniden dağıtır (nokta iptalinden sonra yeni
-- toplamla da çağrılır). trg_delivery_fee_expense giderleri kendisi senkronlar.
CREATE OR REPLACE FUNCTION public.bbk_split_point_fee(p_tracking_no text, p_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids  uuid[];
  v_n    int;
  v_each numeric;
  v_i    int := 0;
  v_id   uuid;
begin
  if p_tracking_no is null or p_total is null or p_total < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_args');
  end if;
  select array_agg(id order by created_at, id) into v_ids
    from public.deliveries
   where btrim(external_tracking_no) = btrim(p_tracking_no)
     and external_point_ref is not null
     and coalesce(external_provider,'') ilike '%banabikurye%'
     and status <> 'iptal';
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', true, 'rows', 0); end if;
  v_each := round(p_total / v_n, 2);
  foreach v_id in array v_ids loop
    v_i := v_i + 1;
    update public.deliveries
       set fee_amount = case when v_i = v_n then p_total - v_each * (v_n - 1) else v_each end,
           fee_source = 'banabikurye'
     where id = v_id;
  end loop;
  return jsonb_build_object('ok', true, 'rows', v_n, 'each', v_each);
end
$function$;

-- ── Çok noktalı gönderi satırları — tek işlemde, hepsi ya da hiçbiri ─────────
-- Kullanıcı JWT'siyle çağrılır (create_delivery yetki/kiracı denetimleri aynen
-- işler; auth.uid() iç çağrıya taşınır). p_drops: [{ref, work_order_id?, direction,
-- purpose?, party_name?, party_address?, party_phone?, party_lat?, party_lng?,
-- point_id?, delivery_id?, tracking_url?, stage_snapshot?}]
CREATE OR REPLACE FUNCTION public.create_multi_drop_deliveries(
  p_tracking_no  text,
  p_fee_total    numeric,
  p_fee_currency text,
  p_notes        text,
  p_drops        jsonb
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_drop jsonb;
  v_id   uuid;
  v_ref  text;
  v_dir  text;
  v_out  jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if coalesce(btrim(p_tracking_no), '') = '' then raise exception 'takip no zorunlu'; end if;
  if jsonb_typeof(p_drops) <> 'array' or jsonb_array_length(p_drops) < 2 then
    raise exception 'çok noktalı gönderide en az 2 teslim noktası olmalı';
  end if;
  if jsonb_array_length(p_drops) > 98 then
    raise exception 'en çok 98 teslim noktası';
  end if;

  for v_drop in select * from jsonb_array_elements(p_drops) loop
    v_ref := nullif(btrim(coalesce(v_drop->>'ref', '')), '');
    if v_ref is null or length(v_ref) > 32 then raise exception 'nokta ref geçersiz'; end if;
    v_dir := coalesce(nullif(v_drop->>'direction', ''),
                      case when nullif(v_drop->>'work_order_id','') is null then 'lab_to_other' else 'lab_to_clinic' end);
    if v_dir not in ('lab_to_clinic', 'lab_to_other') then
      raise exception 'çok noktalı gönderide alım lab olmalı (yön %)', v_dir;
    end if;

    v_id := public.create_delivery(
      p_work_order_id        => nullif(v_drop->>'work_order_id', '')::uuid,
      p_mode                 => 'external',
      p_external_provider    => 'BanaBiKurye',
      p_external_tracking_no => btrim(p_tracking_no),
      p_notes                => coalesce(nullif(v_drop->>'note', ''), p_notes),
      p_purpose              => coalesce(nullif(v_drop->>'purpose', ''),
                                         case when v_dir = 'lab_to_clinic' then 'teslimat' else 'diger' end),
      p_direction            => v_dir,
      p_fee_amount           => null,           -- aşağıda tek seferde bölünür
      p_fee_currency         => p_fee_currency,
      p_fee_source           => null,
      p_stage_snapshot       => nullif(v_drop->>'stage_snapshot', ''),
      p_party_name           => nullif(v_drop->>'party_name', ''),
      p_party_address        => nullif(v_drop->>'party_address', ''),
      p_party_phone          => nullif(v_drop->>'party_phone', ''),
      p_party_lat            => nullif(v_drop->>'party_lat', '')::numeric,
      p_party_lng            => nullif(v_drop->>'party_lng', '')::numeric
    );

    update public.deliveries
       set external_point_ref    = v_ref,
           external_point_id     = nullif(v_drop->>'point_id', ''),
           external_delivery_id  = nullif(v_drop->>'delivery_id', ''),
           external_tracking_url = nullif(v_drop->>'tracking_url', '')
     where id = v_id;

    v_out := v_out || jsonb_build_object('ref', v_ref, 'delivery_id', v_id);
  end loop;

  if p_fee_total is not null and p_fee_total > 0 then
    update public.deliveries set fee_currency = coalesce(p_fee_currency, fee_currency)
     where btrim(external_tracking_no) = btrim(p_tracking_no) and external_point_ref is not null;
    perform public.bbk_split_point_fee(p_tracking_no, p_fee_total);
  end if;

  return v_out;
end
$function$;

REVOKE ALL ON FUNCTION public.bbk_apply_point_status(text, delivery_status, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bbk_apply_point_proof(text, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bbk_split_point_fee(text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bbk_apply_point_status(text, delivery_status, timestamptz, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bbk_apply_point_proof(text, text, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bbk_split_point_fee(text, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.create_multi_drop_deliveries(text, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_multi_drop_deliveries(text, numeric, text, text, jsonb) TO authenticated, service_role;
