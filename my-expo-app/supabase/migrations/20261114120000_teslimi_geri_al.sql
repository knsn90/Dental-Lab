-- Teslimi geri al — yanlışlıkla/erken "teslim edildi" yapılan siparişi üretim aşamasına döndürür.
--
-- Neden: teslim edilmiş sipariş detayı salt okunur (madde 14) ve revert_stage aktif aşama ister;
-- yanlış teslimin ekrandan dönüşü yoktu (NEX-2026-0222, 2026-11-14).
--
-- İki fonksiyon, TEK kural (_delivery_undo_check):
--   delivery_undo_preview(p_order)          → ekrandaki uyarı: ne silinecek, engel var mı, aşamalar
--   delivery_undo(p_order, p_stage, p_note) → aynı denetimi yeniden yapar ve uygular
--
-- Engeller (geri alınmaz):
--   invoice_issued     kesilmiş (taslak/iptal dışı) fatura var → önce fatura iptal edilir
--   invoice_shared     taslak fatura başka siparişleri de kapsıyor (toplu taslak)
--   invoice_paid       taslak faturaya ödeme bağlı
--   courier_delivered  nihai kurye bacağı (lab→klinik, teslimat) teslim edilmiş
-- Silinenler: yalnız bu siparişe ait TASLAK fatura + gönderilmemiş değerlendirme isteği
--   (ikisi de yeniden teslimde tetikleyicilerle kendiliğinden oluşur).
-- Yalnız eklemeli: mevcut fonksiyon/tetikleyici/politika değişmez.

create or replace function public._delivery_undo_check(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_status   text;
  v_issued   text;
  v_shared   text;
  v_paid     text;
  v_draft    jsonb;
  v_review   text;
  v_stages   jsonb;
  v_default  uuid;
begin
  select w.status::text into v_status from work_orders w where w.id = p_order;
  if v_status is null then
    return jsonb_build_object('ok', false, 'block', 'not_found');
  end if;
  if v_status <> 'teslim_edildi' then
    return jsonb_build_object('ok', false, 'block', 'not_delivered');
  end if;

  -- Bu siparişe bağlı faturalar (tekil bağ + toplu fatura bağı)
  with inv as (
    select i.* from invoices i
     where i.work_order_id = p_order
        or i.id in (select io.invoice_id from invoice_orders io where io.work_order_id = p_order)
  )
  select
    (select i.invoice_number from inv i where i.status not in ('taslak', 'iptal') order by i.created_at limit 1),
    (select i.invoice_number from inv i where i.status = 'taslak'
        and (exists (select 1 from invoice_orders io where io.invoice_id = i.id and io.work_order_id <> p_order)
             or (i.work_order_id is not null and i.work_order_id <> p_order))
      order by i.created_at limit 1),
    (select i.invoice_number from inv i where i.status = 'taslak'
        and exists (select 1 from payments p where p.invoice_id = i.id)
      order by i.created_at limit 1),
    (select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.invoice_number,
                                         'total', i.total, 'currency', i.currency) order by i.created_at)
       from inv i where i.status = 'taslak')
  into v_issued, v_shared, v_paid, v_draft;

  if v_issued is not null then
    return jsonb_build_object('ok', false, 'block', 'invoice_issued', 'block_ref', v_issued);
  end if;
  if v_shared is not null then
    return jsonb_build_object('ok', false, 'block', 'invoice_shared', 'block_ref', v_shared);
  end if;
  if v_paid is not null then
    return jsonb_build_object('ok', false, 'block', 'invoice_paid', 'block_ref', v_paid);
  end if;

  if exists (select 1 from deliveries d
              where d.work_order_id = p_order and d.status::text = 'teslim_edildi'
                and d.direction = 'lab_to_clinic' and d.purpose = 'teslimat') then
    return jsonb_build_object('ok', false, 'block', 'courier_delivered');
  end if;

  -- Değerlendirme: queued = silinecek · sent = kliniğe gitmiş (kalır) · answered = puanlanmış (kalır)
  select case
           when exists (select 1 from order_reviews r where r.work_order_id = p_order) then 'answered'
           when rr.sent_at is not null or rr.status not in ('queued', 'skipped') then 'sent'
           else 'queued'
         end
    into v_review
    from review_requests rr where rr.work_order_id = p_order;
  if v_review is null and exists (select 1 from order_reviews r where r.work_order_id = p_order) then
    v_review := 'answered';
  end if;

  -- Dönülebilecek aşamalar: tamamlanmış/onaylanmış (atlananlar hariç)
  select jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(st.name, '—'),
                                      'seq', s.sequence_order, 'lane', s.lane)
                   order by s.lane, s.sequence_order)
    into v_stages
    from order_stages s
    left join lab_stations st on st.id = s.station_id
   where s.work_order_id = p_order and s.status in ('tamamlandi', 'onaylandi');

  -- Varsayılan: en son tamamlanan aşama
  select s.id into v_default
    from order_stages s
   where s.work_order_id = p_order and s.status in ('tamamlandi', 'onaylandi')
   order by s.completed_at desc nulls last, s.sequence_order desc
   limit 1;

  if v_default is null then
    return jsonb_build_object('ok', false, 'block', 'no_stage');
  end if;

  return jsonb_build_object(
    'ok', true,
    'stages', coalesce(v_stages, '[]'::jsonb),
    'default_stage_id', v_default,
    'draft_invoices', coalesce(v_draft, '[]'::jsonb),
    'review', v_review
  );
end;
$function$;

revoke all on function public._delivery_undo_check(uuid) from public, anon, authenticated;

-- Çağıran lab yöneticisi/admin mi + sipariş kendi lab'ında mı
create or replace function public._delivery_undo_assert(p_order uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_user_type text; v_role text;
begin
  if v_caller is null then raise exception 'auth required' using errcode = '42501'; end if;
  select user_type, role into v_user_type, v_role from profiles where id = v_caller;
  if not (v_user_type = 'admin' or (v_user_type = 'lab' and v_role in ('manager', 'admin'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform assert_my_order(p_order);
end;
$function$;

revoke all on function public._delivery_undo_assert(uuid) from public, anon, authenticated;

create or replace function public.delivery_undo_preview(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform _delivery_undo_assert(p_order);
  return _delivery_undo_check(p_order);
end;
$function$;

create or replace function public.delivery_undo(p_order uuid, p_stage uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller  uuid := auth.uid();
  v_chk     jsonb;
  v_stage   uuid;
  v_seq     int;
  v_lane    int;
  v_inv     record;
  v_deleted text[] := '{}';
  v_review_deleted boolean := false;
  v_note    text;
begin
  perform _delivery_undo_assert(p_order);

  -- Satırı kilitle: eşzamanlı ikinci tıklama / fatura kesme ile yarışmasın
  perform 1 from work_orders where id = p_order for update;

  v_chk := _delivery_undo_check(p_order);
  if not coalesce((v_chk->>'ok')::boolean, false) then
    raise exception 'UNDO_BLOCKED:%', coalesce(v_chk->>'block', 'unknown')
      using errcode = 'P0001', detail = coalesce(v_chk->>'block_ref', '');
  end if;

  v_stage := coalesce(p_stage, (v_chk->>'default_stage_id')::uuid);
  select s.sequence_order, s.lane into v_seq, v_lane
    from order_stages s
   where s.id = v_stage and s.work_order_id = p_order and s.status in ('tamamlandi', 'onaylandi');
  if v_seq is null then
    raise exception 'UNDO_BLOCKED:bad_stage' using errcode = 'P0001';
  end if;

  -- 1) Yalnız bu siparişe ait taslak fatura(lar) — kalem/bağ satırları FK ile birlikte silinir
  for v_inv in
    select (x->>'id')::uuid as id, x->>'number' as number
      from jsonb_array_elements(v_chk->'draft_invoices') x
  loop
    delete from invoices where id = v_inv.id and status = 'taslak';
    v_deleted := v_deleted || v_inv.number;
  end loop;

  -- 2) Gönderilmemiş değerlendirme isteği
  if v_chk->>'review' = 'queued' then
    delete from review_requests
     where work_order_id = p_order and sent_at is null and status in ('queued', 'skipped');
    v_review_deleted := found;
  end if;

  -- 3) Aşamalar: aynı şeritte hedeften sonrakiler bekliyor, hedef aktif
  update order_stages
     set status = 'bekliyor', started_at = null, completed_at = null
   where work_order_id = p_order and lane = v_lane and sequence_order > v_seq
     and status in ('tamamlandi', 'onaylandi');

  update order_stages
     set status = 'aktif', started_at = null, completed_at = null
   where id = v_stage;

  -- 4) Sipariş
  update work_orders
     set status = 'asamada', delivered_at = null, current_stage_id = v_stage
   where id = p_order;

  -- 5) Geçmiş (status_history → log_status_changed aktivite kaydını yazar)
  v_note := 'Teslim geri alındı'
    || case when array_length(v_deleted, 1) > 0
            then ' · taslak fatura silindi: ' || array_to_string(v_deleted, ', ') else '' end
    || case when nullif(trim(coalesce(p_note, '')), '') is not null
            then ' · ' || trim(p_note) else '' end;
  insert into status_history (work_order_id, changed_by, old_status, new_status, note)
  values (p_order, v_caller, 'teslim_edildi', 'asamada', v_note);

  return jsonb_build_object(
    'ok', true, 'stage_id', v_stage,
    'deleted_invoices', to_jsonb(v_deleted),
    'review_deleted', v_review_deleted
  );
end;
$function$;

revoke all on function public.delivery_undo_preview(uuid) from public, anon;
revoke all on function public.delivery_undo(uuid, uuid, text) from public, anon;
grant execute on function public.delivery_undo_preview(uuid) to authenticated;
grant execute on function public.delivery_undo(uuid, uuid, text) to authenticated;
