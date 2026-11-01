-- 2. dalga 5 — son inceleme düzeltmesi (20261028102000_kanit_kardes)
-- "Birlikte kapat" kardeş listesi yalnız kuryenin teslim aldığı ya da yolda olan paketleri içerir.
-- Önce: atandi/beklemede (hâlâ lab'da) paket de listeleniyordu; varsayılan açık seçenekle kapanıp
-- kliniğe yanlış 'teslim edildi' bildirimi gidebilirdi.

CREATE OR REPLACE FUNCTION public.delivery_proof_siblings(p_delivery uuid)
 RETURNS TABLE(delivery_id uuid, order_number text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d2.id, wo.order_number
    from public.deliveries d
    join public.deliveries d2 on d2.courier_id = d.courier_id and d2.id <> d.id
    join public.work_orders wo on wo.id = d2.work_order_id
   where d.id = p_delivery
     and d.courier_id = auth.uid()
     and d.work_order_id is not null
     and coalesce(d.direction, 'lab_to_clinic') = 'lab_to_clinic'
     and d2.mode = 'internal'
     and d2.status::text in ('teslim_alindi', 'yolda')  -- 20261028102000: yalnız kuryenin elindeki/yoldaki paket
     and coalesce(d2.direction, 'lab_to_clinic') = 'lab_to_clinic'
     and public._resolve_wo_clinic_id(d.work_order_id) is not null
     and public._resolve_wo_clinic_id(d2.work_order_id) = public._resolve_wo_clinic_id(d.work_order_id)
   order by d2.created_at;
$function$;

revoke all on function public.delivery_proof_siblings(uuid) from public, anon;
grant execute on function public.delivery_proof_siblings(uuid) to authenticated;
