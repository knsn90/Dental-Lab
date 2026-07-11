-- Faz A — Hekim/Klinik: planlama ÖNCESİ sipariş düzenle & iptal (SECURITY DEFINER RPC'ler)
--
-- Kural: planlama başlamadan (work_orders.triaged_at IS NULL) sipariş sahibi hekim
-- veya kliniği eşleşen klinik kullanıcısı, siparişi DOĞRUDAN iptal/düzenleyebilir.
-- Planlama başladıysa (triaged_at dolu) bu RPC'ler hata döndürür (iptal/direkt düzenleme yok);
-- o durumda değişiklik-talebi akışı (Faz B) kullanılır.
--
-- Tablo RLS'i genişletilmez: yetki + gate SUNUCUDA bu fonksiyonlarda zorlanır.

-- ── Sahiplik: caller bu siparişi düzenleyebilir mi? ──────────────────────────
-- Hekim: work_orders.doctor_id = auth.uid()  (mevcut "Doctors see own orders" ile aynı)
-- Klinik: my_clinic_id() = siparişin kliniği (clinic_admin + secretary dahil)
create or replace function public._client_owns_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.work_orders wo
    where wo.id = p_order_id
      and (
        wo.doctor_id = auth.uid()
        or (
          public.my_clinic_id() is not null
          and public.my_clinic_id() = public._resolve_wo_clinic_id(wo.id)
        )
      )
  );
$$;

-- ── Planlama başladı mı? (kayıt yoksa güvenli taraf: başlamış say) ───────────
create or replace function public._order_planning_started(p_order_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select triaged_at is not null from public.work_orders where id = p_order_id),
    true
  );
$$;

-- ── İptal (planlama öncesi, direkt) ─────────────────────────────────────────
create or replace function public.client_cancel_order(p_order_id uuid)
returns public.work_orders
language plpgsql security definer set search_path to 'public'
as $$
declare v_row public.work_orders;
begin
  if not public._client_owns_order(p_order_id) then
    raise exception 'Bu siparişi iptal etme yetkiniz yok.' using errcode = '42501';
  end if;
  if public._order_planning_started(p_order_id) then
    raise exception 'Planlaması başlamış bir sipariş iptal edilemez.' using errcode = 'P0001';
  end if;

  update public.work_orders
     set status = 'iptal', updated_at = now()
   where id = p_order_id and status <> 'iptal'
   returning * into v_row;

  if v_row.id is null then
    -- zaten iptal veya bulunamadı → mevcut satırı döndür
    select * into v_row from public.work_orders where id = p_order_id;
  end if;
  return v_row;
end;
$$;

-- ── Düzenle (planlama öncesi, direkt) ───────────────────────────────────────
-- p_fields: work_orders alanları (yalnız verilenler güncellenir, coalesce).
-- p_items : verilirse order_items TAMAMEN yeniden yazılır (sil + ekle).
create or replace function public.client_update_order(
  p_order_id uuid,
  p_fields   jsonb,
  p_items    jsonb default null
)
returns public.work_orders
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_row   public.work_orders;
  v_item  jsonb;
  v_teeth int[];
begin
  if not public._client_owns_order(p_order_id) then
    raise exception 'Bu siparişi düzenleme yetkiniz yok.' using errcode = '42501';
  end if;
  if public._order_planning_started(p_order_id) then
    raise exception 'Planlaması başlamış sipariş doğrudan düzenlenemez; değişiklik talebi gerekir.' using errcode = 'P0001';
  end if;

  if p_fields ? 'tooth_numbers' then
    select array_agg((x)::int) into v_teeth
    from jsonb_array_elements_text(p_fields->'tooth_numbers') as t(x);
  end if;

  update public.work_orders set
    patient_name        = coalesce(p_fields->>'patient_name',        patient_name),
    patient_id          = coalesce(p_fields->>'patient_id',          patient_id),
    patient_gender      = coalesce(p_fields->>'patient_gender',      patient_gender),
    patient_nationality = coalesce(p_fields->>'patient_nationality', patient_nationality),
    patient_country     = coalesce(p_fields->>'patient_country',     patient_country),
    patient_city        = coalesce(p_fields->>'patient_city',        patient_city),
    work_type           = coalesce(p_fields->>'work_type',           work_type),
    shade               = coalesce(p_fields->>'shade',               shade),
    model_type          = coalesce(p_fields->>'model_type',          model_type),
    delivery_method     = coalesce(p_fields->>'delivery_method',     delivery_method),
    delivery_date       = coalesce((p_fields->>'delivery_date')::date, delivery_date),
    is_urgent           = coalesce((p_fields->>'is_urgent')::boolean,  is_urgent),
    notes               = coalesce(p_fields->>'notes',               notes),
    tooth_numbers       = coalesce(v_teeth,                          tooth_numbers),
    updated_at          = now()
  where id = p_order_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sipariş bulunamadı.' using errcode = 'P0002';
  end if;

  -- order_items: p_items verildiyse tümüyle yeniden yaz
  if p_items is not null then
    delete from public.order_items where work_order_id = p_order_id;
    for v_item in select * from jsonb_array_elements(p_items) loop
      insert into public.order_items (work_order_id, name, price, quantity, tooth_numbers, notes)
      values (
        p_order_id,
        coalesce(v_item->>'name', ''),
        coalesce((v_item->>'price')::numeric, 0),
        coalesce((v_item->>'quantity')::int, 1),
        case when v_item ? 'tooth_numbers'
          then (select array_agg((x)::int) from jsonb_array_elements_text(v_item->'tooth_numbers') as t(x))
          else null end,
        nullif(v_item->>'notes', '')
      );
    end loop;
  end if;

  return v_row;
end;
$$;

grant execute on function public._client_owns_order(uuid)        to authenticated;
grant execute on function public._order_planning_started(uuid)   to authenticated;
grant execute on function public.client_cancel_order(uuid)       to authenticated;
grant execute on function public.client_update_order(uuid, jsonb, jsonb) to authenticated;
