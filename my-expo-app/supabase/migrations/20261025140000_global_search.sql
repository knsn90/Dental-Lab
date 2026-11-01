-- 20261025140000_global_search.sql
-- Genel arama (2. dalga 1, Y1). Spec: docs/superpowers/specs/2026-10-25-genel-arama-design.md
-- * search_fold: Türkçe harf + büyük/küçük katlama ("Ayşe"/"AYŞE"/"ayse", "İSMAİL"/"ismail").
--   ilike bunu yapmıyor (denendi: 'Ayşe' ilike '%ayse%' = false, lower('İ') 2 karakter).
-- * global_search: sipariş / klinik / hekim / fatura, tek gidiş-dönüş. SECURITY INVOKER →
--   çağıranın RLS'i uygulanır; arama yeni bir okuma yolu açmaz. Faturada lab personeline
--   ayrıca finans yetkisi şartı (invoices_lab_select lab'daki herkese açık; arama bunu yaymaz).
-- Geri alma: supabase/rollbacks/20261025140000_global_search.down.sql

create or replace function public.search_fold(p text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select translate(lower(coalesce(p, '')), 'ıiçğöşüâîû' || chr(775), 'iicgosuaiu')
$$;

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
begin
  if length(v_q) < 2 or p_kinds is null then
    return jsonb_build_object('orders', v_orders, 'orders_more', false,
      'clinics', v_clinics, 'doctors', v_doctors, 'invoices', v_invoices);
  end if;

  -- % _ \ harfiyen aranır
  v_pat := '%' || replace(replace(replace(public.search_fold(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  if 'orders' = any(p_kinds) then
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

revoke all on function public.global_search(text, text[], uuid, boolean) from public, anon;
grant execute on function public.global_search(text, text[], uuid, boolean) to authenticated;
