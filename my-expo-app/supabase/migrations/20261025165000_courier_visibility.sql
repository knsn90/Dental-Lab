-- 20261025165000_courier_visibility.sql
-- Rol görünürlüğü paketi E (spec §2 karar 2, 5): kurye yalnız kendisine atanmış teslimatları ve bu
-- teslimatların siparişlerini görür. _field_staff_sees kurye dalı daralır (work_orders okuma, 24 alt
-- tablo field_staff_scope, depo, yaşam döngüsü koruması hepsi bunu kullanır); deliveries'e yalnız
-- kuryeyi daraltan RESTRICTIVE courier_scope eklenir (lab/müdür/klinik kuralları aynen).
-- Geri alma: rollbacks/20261025165000_courier_visibility.down.sql

CREATE OR REPLACE FUNCTION public._field_staff_sees(p_wo uuid, p_assigned uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case public.my_role_key()
    when 'technician' then
      p_assigned = auth.uid()
      or exists (select 1 from public.order_stages os
                  where os.work_order_id = p_wo
                    and (os.technician_id = auth.uid()
                         or (os.technician_id is null and os.status = 'aktif')))
    when 'courier' then
      exists (select 1 from public.deliveries d
               where d.work_order_id = p_wo and d.courier_id = auth.uid())
    else true
  end
$function$
;

drop policy if exists courier_scope on public.deliveries;
create policy courier_scope on public.deliveries as restrictive for all to authenticated
  using (((select public.my_role_key()) <> 'courier') or courier_id = (select auth.uid()))
  with check (((select public.my_role_key()) <> 'courier') or courier_id = (select auth.uid()));
