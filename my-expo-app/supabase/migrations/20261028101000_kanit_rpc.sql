-- 2. dalga 5 — Kurye teslim kanıtı: RPC'ler ve bildirim metni (20261028101000_kanit_rpc)
-- deliver_with_proof, close_delivery_without_proof, delivery_proof_siblings, bbk_apply_delivery_proof,
-- _delivery_proof_notice + klinik yöneticisi teslim bildirimine kanıt özeti.

-- Kanıt dosyası bu teslimatın klasöründe ve alanda gerçekten var mı?
create or replace function public._delivery_proof_file_ok(p_lab uuid, p_delivery uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select p_path is not null
     and position('..' in p_path) = 0
     and p_path like p_lab::text || '/' || p_delivery::text || '/%'
     and exists (select 1 from storage.objects o
                  where o.bucket_id = 'delivery-proofs' and o.name = p_path);
$function$;

-- Teslimatı kapatır: siparişe bağlıysa bugünkü update_delivery_status yolu (sipariş kapanışı,
-- bekleme temizliği, prova/fatura tetikleyicileri aynen); siparişsizse doğrudan.
-- Arayan yetkisini update_delivery_status kendi denetler (kurye ya da yönetici).
create or replace function public._delivery_proof_close(p_delivery uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare v_wo uuid;
begin
  select work_order_id into v_wo from public.deliveries where id = p_delivery;
  if v_wo is not null then
    perform public.update_delivery_status(p_delivery, 'teslim_edildi', null);
  else
    update public.deliveries
       set status = 'teslim_edildi', delivered_at = coalesce(delivered_at, now())
     where id = p_delivery;
  end if;
end;
$function$;

create or replace function public.deliver_with_proof(p_items jsonb, p_recipient_name text default null, p_skip_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item  jsonb;
  v_d     record;
  v_photo text;
  v_sig   text;
  v_n     int := 0;
  v_name  text := left(nullif(btrim(coalesce(p_recipient_name, '')), ''), 120);
  v_skip  text := left(nullif(btrim(coalesce(p_skip_reason, '')), ''), 300);
begin
  if auth.uid() is null then
    raise exception 'Bu teslimat size atanmamış' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 10 then
    raise exception 'Teslimat bulunamadı';
  end if;
  if length(coalesce(v_name, '')) < 2 then v_name := null; end if;
  if length(coalesce(v_skip, '')) < 3 then v_skip := null; end if;

  -- Tek işlem: herhangi bir öğe geçmezse hiçbiri kapanmaz.
  for v_item in select value from jsonb_array_elements(p_items) loop
    select d.id, d.lab_id, d.courier_id, d.mode, d.status::text as st,
           coalesce(d.direction, 'lab_to_clinic') as dir
      into v_d
      from public.deliveries d
     where d.id = public.try_uuid(v_item->>'delivery_id')
     for update;
    if not found then
      raise exception 'Teslimat bulunamadı';
    end if;
    if v_d.courier_id is distinct from auth.uid() then
      raise exception 'Bu teslimat size atanmamış' using errcode = '42501';
    end if;
    if v_d.mode is distinct from 'internal' or v_d.st in ('teslim_edildi', 'iptal') then
      raise exception 'Teslimat kapanmış ya da iptal edilmiş';
    end if;

    v_photo := nullif(btrim(coalesce(v_item->>'photo_path', '')), '');
    if v_photo is null then
      raise exception 'Teslim için fotoğraf gerekli';
    end if;
    if not public._delivery_proof_file_ok(v_d.lab_id, v_d.id, v_photo) then
      raise exception 'Kanıt dosyası bulunamadı';
    end if;

    v_sig := null;
    if v_d.dir = 'lab_to_clinic' then
      if v_skip is null then
        v_sig := nullif(btrim(coalesce(v_item->>'signature_path', '')), '');
        if v_name is null or v_sig is null then
          raise exception 'Teslim için teslim alanın adı ve imzası gerekli';
        end if;
        if not public._delivery_proof_file_ok(v_d.lab_id, v_d.id, v_sig) then
          raise exception 'Kanıt dosyası bulunamadı';
        end if;
      end if;
      update public.deliveries
         set proof_photo_path = v_photo,
             signature_path = v_sig,
             recipient_name = v_name,
             signature_skipped_reason = v_skip,
             proof_source = 'courier', proof_captured_at = now(),
             proof_override_reason = null, proof_override_by = null,
             proof_override_by_name = null, proof_override_at = null
       where id = v_d.id;
    else
      -- lab'a ya da dış tarafa teslim: yalnız fotoğraf
      update public.deliveries
         set proof_photo_path = v_photo,
             proof_source = 'courier', proof_captured_at = now(),
             proof_override_reason = null, proof_override_by = null,
             proof_override_by_name = null, proof_override_at = null
       where id = v_d.id;
    end if;

    perform public._delivery_proof_close(v_d.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

create or replace function public.close_delivery_without_proof(p_delivery uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_d      record;
  v_ut     text;
  v_role   text;
  v_full   text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select d.id, d.lab_id, d.mode, d.status::text as st into v_d
    from public.deliveries d where d.id = p_delivery for update;
  if not found then
    raise exception 'Teslimat bulunamadı';
  end if;
  select user_type, role, full_name into v_ut, v_role, v_full from public.profiles where id = auth.uid();
  if not (public.is_platform_admin()
          or (v_d.lab_id = public.get_my_lab_id()
              and (v_ut = 'admin' or (v_ut = 'lab' and v_role in ('manager', 'admin'))))) then
    raise exception 'Kanıtsız kapatma yalnız yöneticiye açık' using errcode = '42501';
  end if;
  if v_d.mode is distinct from 'internal' then
    raise exception 'Yalnız kendi kurye teslimatları kanıtsız kapatılır';
  end if;
  if v_d.st in ('teslim_edildi', 'iptal') then
    raise exception 'Teslimat kapanmış ya da iptal edilmiş';
  end if;
  if length(v_reason) < 6 then
    raise exception 'Nedeni en az 6 karakter yazın';
  end if;

  update public.deliveries
     set proof_source = 'manager_override',
         proof_override_reason = left(v_reason, 500),
         proof_override_by = auth.uid(),
         proof_override_by_name = v_full,
         proof_override_at = now()
   where id = p_delivery;
  perform public._delivery_proof_close(p_delivery);
end;
$function$;

-- Aynı ziyaret: aynı kuryenin aynı kliniğe giden diğer açık kendi kurye teslimatları
create or replace function public.delivery_proof_siblings(p_delivery uuid)
returns table(delivery_id uuid, order_number text)
language sql
stable
security definer
set search_path = public
as $function$
  select d2.id, wo.order_number
    from public.deliveries d
    join public.deliveries d2 on d2.courier_id = d.courier_id and d2.id <> d.id
    join public.work_orders wo on wo.id = d2.work_order_id
   where d.id = p_delivery
     and d.courier_id = auth.uid()
     and d.work_order_id is not null
     and coalesce(d.direction, 'lab_to_clinic') = 'lab_to_clinic'
     and d2.mode = 'internal'
     and d2.status::text not in ('teslim_edildi', 'iptal')
     and coalesce(d2.direction, 'lab_to_clinic') = 'lab_to_clinic'
     and public._resolve_wo_clinic_id(d.work_order_id) is not null
     and public._resolve_wo_clinic_id(d2.work_order_id) = public._resolve_wo_clinic_id(d.work_order_id)
   order by d2.created_at;
$function$;

-- BanaBiKurye kanıtı (yalnız sunucu): dolu alanın üzerine yazmaz; denendi damgası hep yazılır
create or replace function public.bbk_apply_delivery_proof(
  p_tracking_no text, p_recipient_name text, p_recipient_title text,
  p_visit_at timestamptz, p_place_photo_path text, p_sign_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

-- Klinik yöneticisi bildirimi için teslim kanıtı özeti ("Sabit · değişken" — autoT önek eşleşmesi)
create or replace function public._delivery_proof_notice(p_order uuid)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select case
           when x.proof_source = 'manager_override' then 'Kanıtsız kapatıldı · ' || x.t
           when nullif(btrim(x.recipient_name), '') is not null then 'Teslim alan: ' || btrim(x.recipient_name) || ' · ' || x.t
           when nullif(btrim(x.signature_skipped_reason), '') is not null then 'İmza alınamadı · ' || x.t
           else 'Teslim saati: ' || x.t
         end
    from (select d.proof_source, d.recipient_name, d.signature_skipped_reason,
                 to_char(coalesce(d.delivered_at, now()) at time zone public.lab_tz(d.lab_id), 'HH24:MI') as t
            from public.deliveries d
           where d.work_order_id = p_order
             and d.status::text = 'teslim_edildi'
             and coalesce(d.purpose, 'teslimat') = 'teslimat'
             and coalesce(d.direction, 'lab_to_clinic') = 'lab_to_clinic'
           order by d.delivered_at desc nulls last
           limit 1) x;
$function$;

revoke all on function public._delivery_proof_file_ok(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._delivery_proof_close(uuid) from public, anon, authenticated;
revoke all on function public._delivery_proof_notice(uuid) from public, anon, authenticated;
revoke all on function public.deliver_with_proof(jsonb, text, text) from public, anon;
revoke all on function public.close_delivery_without_proof(uuid, text) from public, anon;
revoke all on function public.delivery_proof_siblings(uuid) from public, anon;
revoke all on function public.bbk_apply_delivery_proof(text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.deliver_with_proof(jsonb, text, text) to authenticated;
grant execute on function public.close_delivery_without_proof(uuid, text) to authenticated;
grant execute on function public.delivery_proof_siblings(uuid) to authenticated;
grant execute on function public.bbk_apply_delivery_proof(text, text, text, timestamptz, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.trg_work_order_notify_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_label TEXT; v_admin RECORD; v_clinic_id UUID; v_clinic_user RECORD;
  v_ready BOOLEAN; v_doctor_id UUID; v_rd_title TEXT; v_rd_body TEXT;
  v_clinic_name TEXT; v_patient TEXT; v_cr_title TEXT; v_cr_body TEXT; v_cr_payload JSONB;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  v_label := CASE NEW.status::TEXT
    WHEN 'alindi'           THEN 'Alındı'
    WHEN 'asamada'          THEN 'Üretimde'
    WHEN 'uretimde'         THEN 'Üretimde'
    WHEN 'kalite_kontrol'   THEN 'Final QC'
    WHEN 'teslimata_hazir'  THEN 'Teslime Hazır'
    WHEN 'kurye_bekleniyor' THEN 'Kurye Bekleniyor'
    WHEN 'kuryede'          THEN 'Kuryede'
    WHEN 'teslim_edildi'    THEN 'Teslim Edildi'
    ELSE NEW.status::TEXT
  END;
  v_ready     := (NEW.status::TEXT = 'teslimata_hazir');
  v_doctor_id := NEW.doctor_id;
  v_clinic_id := public._resolve_wo_clinic_id(NEW.id);

  -- ═══ KURYE YOLA ÇIKTI ═══════════════════════════════════════════════
  IF NEW.status::TEXT = 'kuryede' THEN
    v_patient := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta');
    SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_clinic_id;

    v_cr_title := 'Kurye yola çıktı';
    v_cr_body  := v_patient || ' · #' || COALESCE(NEW.order_number, '?')
                  || ' kuryeye teslim edildi. Kuryeyi haritada canlı izleyebilirsiniz.';
    v_cr_payload := jsonb_build_object(
      'status',      NEW.status::text,
      'patient',     v_patient,
      'orderNumber', COALESCE(NEW.order_number, '—'),
      'clinic',      COALESCE(NULLIF(trim(v_clinic_name), ''), '—')
    );

    -- Lab + yönetici (yalnız yönetici rolleri)
    FOR v_admin IN SELECT id FROM public.profiles
                    WHERE lab_id = NEW.lab_id AND user_type IN ('lab','admin')
                      AND COALESCE(role,'manager') IN ('manager','admin')
                      AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_admin.id, 'delivery', v_cr_title, v_cr_body,
        'work_order', NEW.id, '/courier-tracking', v_cr_payload);
    END LOOP;

    -- Hekim (doctor_id bir kullanıcı profili ise)
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_clinic_user.id, 'delivery', v_cr_title, v_cr_body,
        'work_order', NEW.id, '/courier-tracking', v_cr_payload);
    END LOOP;

    -- Klinik yöneticisi + sekreteri (hekimle çakışmasın)
    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN SELECT id FROM public.profiles
                            WHERE clinic_id = v_clinic_id
                              AND user_type IN ('clinic_admin','clinic_secretary')
                              AND COALESCE(is_active, true) = true
                              AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_channels(v_clinic_user.id, 'delivery', v_cr_title, v_cr_body,
          'work_order', NEW.id, '/courier-tracking', v_cr_payload);
      END LOOP;
    END IF;

    RETURN NEW;   -- genel statü bildirimini ATLA (çift satır olmasın)
  END IF;

  -- ═══ DİĞER STATÜLER (değişmedi) ═════════════════════════════════════
  FOR v_admin IN SELECT id FROM public.profiles
                  WHERE lab_id = NEW.lab_id AND user_type IN ('lab','admin')
                    AND COALESCE(role,'manager') IN ('manager','admin')
                    AND COALESCE(is_active, true) = true LOOP
    PERFORM public._notify_inapp(v_admin.id, 'order_status',
      'Sipariş statüsü: ' || v_label, '#' || COALESCE(NEW.order_number, '?'),
      'work_order', NEW.id, '/order/' || NEW.id::text,
      jsonb_build_object('status', NEW.status::text));
  END LOOP;

  IF v_ready THEN
    v_rd_title := 'Teslimata hazır';
    v_rd_body  := COALESCE(NULLIF(trim(NEW.patient_name), ''), 'Hasta')
                  || ' · #' || COALESCE(NEW.order_number, '?');

    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE id = v_doctor_id AND COALESCE(is_active, true) = true LOOP
      PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
        'work_order', NEW.id, '/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;

    IF v_clinic_id IS NOT NULL THEN
      FOR v_clinic_user IN SELECT id FROM public.profiles
                            WHERE clinic_id = v_clinic_id
                              AND user_type IN ('clinic_admin','clinic_secretary')
                              AND COALESCE(is_active, true) = true
                              AND id IS DISTINCT FROM v_doctor_id LOOP
        PERFORM public._notify_channels(v_clinic_user.id, 'ready_for_delivery', v_rd_title, v_rd_body,
          'work_order', NEW.id, '/order/' || NEW.id::text,
          jsonb_build_object('status', NEW.status::text));
      END LOOP;
    END IF;

  ELSIF v_clinic_id IS NOT NULL THEN
    FOR v_clinic_user IN SELECT id FROM public.profiles
                          WHERE clinic_id = v_clinic_id AND user_type = 'clinic_admin'
                            AND COALESCE(is_active, true) = true LOOP
      -- 20261028101000: teslimde gövdenin başına teslim kanıtı özeti ("Teslim alan: … · HH:MI")
      PERFORM public._notify_inapp(v_clinic_user.id, 'order_status',
        'Sipariş statüsü: ' || v_label,
        CASE WHEN NEW.status::text = 'teslim_edildi'
             THEN coalesce(public._delivery_proof_notice(NEW.id) || ' · ', '') ELSE '' END
          || '#' || COALESCE(NEW.order_number, '?'),
        'work_order', NEW.id, '/order/' || NEW.id::text,
        jsonb_build_object('status', NEW.status::text));
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
