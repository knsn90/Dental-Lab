-- 20261025150000_global_search_technician.sql
-- Genel arama düzeltmesi (son inceleme, Critical): teknisyen aramada Siparişler ekranında
-- göremediği siparişleri (ona atanmamış, hasta adlarıyla) görüyordu. Ekran kuralı aynen:
-- user_type='lab' and role='technician' → yalnız wo.assigned_to = auth.uid().
-- Yalnız global_search gövdesi değişir; imza, SECURITY INVOKER, search_path, izinler aynı.
-- Geri alma: supabase/rollbacks/20261025150000_global_search_technician.down.sql

create or replace function public.global_search(
  p_q text,
  p_kinds text[],
  p_lab_id uuid default null,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q        text := trim(coalesce(p_q, ''));
  v_pat      text;
  v_orders   jsonb := '[]'::jsonb;
  v_more     boolean := false;
  v_clinics  jsonb := '[]'::jsonb;
  v_doctors  jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_lab_staff boolean;
  v_is_tech   boolean;
begin
  if length(v_q) < 2 or p_kinds is null then
    return jsonb_build_object('orders', v_orders, 'orders_more', false,
      'clinics', v_clinics, 'doctors', v_doctors, 'invoices', v_invoices);
  end if;

  -- % _ \ harfiyen aranır
  v_pat := '%' || replace(replace(replace(public.search_fold(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  if 'orders' = any(p_kinds) then
    -- Teknisyen Siparişler ekranında yalnız kendisine atananları görür (OrdersListScreenV2:
    -- assigned_to = profile.id); arama da aynısını yapar — RLS lab'ın tümünü açıyor.
    select exists (select 1 from profiles where id = auth.uid() and user_type = 'lab' and role = 'technician')
      into v_is_tech;
    with hits as (
      select wo.id, wo.order_number, wo.patient_name, wo.status::text as status,
             wo.delivery_date, wo.work_type, coalesce(wo.is_archived, false) as is_archived,
             coalesce(c.name, dp.clinic_name)    as clinic_name,
             coalesce(d.full_name, dp.full_name) as doctor_name,
             row_number() over (
               order by (lower(wo.order_number) = lower(v_q)) desc, wo.created_at desc
             ) as rn
        from work_orders wo
        left join doctors  d  on d.id  = wo.doctor_id          -- doctor_id çok biçimli:
        left join profiles dp on dp.id = wo.doctor_id          -- doctors.id ya da profiles.id
        left join clinics  c  on c.id  = coalesce(d.clinic_id, dp.clinic_id)
       where (p_lab_id is null or wo.lab_id = p_lab_id)
         and (p_include_archived or not coalesce(wo.is_archived, false))
         and (not v_is_tech or wo.assigned_to = auth.uid())
         and (   public.search_fold(wo.order_number) like v_pat escape '\'
              or public.search_fold(wo.patient_name) like v_pat escape '\'
              or public.search_fold(coalesce(c.name, dp.clinic_name)) like v_pat escape '\'
              or public.search_fold(coalesce(d.full_name, dp.full_name)) like v_pat escape '\')
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'order_number', order_number, 'patient_name', patient_name,
             'status', status, 'delivery_date', delivery_date, 'work_type', work_type,
             'is_archived', is_archived, 'clinic_name', clinic_name, 'doctor_name', doctor_name)
             order by rn) filter (where rn <= 8), '[]'::jsonb),
           count(*) filter (where rn = 9) > 0
      into v_orders, v_more
      from hits
     where rn <= 9;
  end if;

  if 'clinics' = any(p_kinds) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'name', x.name, 'is_active', x.is_active,
             'doctor_count', (select count(*) from doctors d where d.clinic_id = x.id))
             order by x.is_active desc, x.name), '[]'::jsonb)
      into v_clinics
      from (select c.id, c.name, coalesce(c.is_active, true) as is_active
              from clinics c
             where (p_lab_id is null or c.lab_id = p_lab_id)
               and public.search_fold(c.name) like v_pat escape '\'
             order by coalesce(c.is_active, true) desc, c.name
             limit 6) x;
  end if;

  if 'doctors' = any(p_kinds) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'full_name', x.full_name, 'clinic_name', x.clinic_name, 'is_active', x.is_active)
             order by x.is_active desc, x.full_name), '[]'::jsonb)
      into v_doctors
      from (select d.id, d.full_name, c.name as clinic_name, coalesce(d.is_active, true) as is_active
              from doctors d
              left join clinics c on c.id = d.clinic_id
             where (p_lab_id is null or d.lab_id = p_lab_id)
               and public.search_fold(d.full_name) like v_pat escape '\'
             order by coalesce(d.is_active, true) desc, d.full_name
             limit 6) x;
  end if;

  if 'invoices' = any(p_kinds) then
    select exists (select 1 from profiles where id = auth.uid() and user_type in ('admin', 'lab'))
      into v_lab_staff;
    -- Lab personeli: Finans menüsünün yetkisi şart. Klinik/hekim: RLS + iptal hariç (klinik listesi gibi).
    if not v_lab_staff
       or public.has_permission('view_financials')
       or public.has_permission('view_finance')
       or public.has_permission('manage_finance') then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'invoice_number', x.invoice_number, 'efatura_number', x.efatura_number,
               'clinic_name', x.clinic_name, 'total', x.total, 'currency', x.currency, 'status', x.status)
               order by x.issue_date desc nulls last), '[]'::jsonb)
        into v_invoices
        from (select i.id, i.invoice_number, i.efatura_number, c.name as clinic_name,
                     i.total, i.currency, i.status, i.issue_date
                from invoices i
                left join clinics c on c.id = i.clinic_id
               where (p_lab_id is null or i.lab_id = p_lab_id)
                 and (v_lab_staff or i.status <> 'iptal')
                 and (   public.search_fold(i.invoice_number) like v_pat escape '\'
                      or public.search_fold(i.efatura_number) like v_pat escape '\')
               order by i.issue_date desc nulls last
               limit 6) x;
    end if;
  end if;

  return jsonb_build_object('orders', v_orders, 'orders_more', v_more,
    'clinics', v_clinics, 'doctors', v_doctors, 'invoices', v_invoices);
end;
$$;
