-- Geri alma: 20261025165000 — courier_scope düşer, _field_staff_sees kurye dalı yeniden açık (true).
drop policy if exists courier_scope on public.deliveries;

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
    when 'courier' then true   -- paket E
    else true
  end
$function$
;
