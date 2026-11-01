-- Kurum kategorisine 'muayenehane' (tek hekimli) eklenir.
-- 1) clinics.category kuralı genişler (mevcut değerler aynen geçerli; NULL serbest).
-- 2) Siteden kayıt: formdaki tür (muayenehane/klinik/poliklinik/hastane) artık kurumun
--    category'sine de yazılır. Eskiden yalnız clinic_type'a yazılıyordu — o sütunu hiçbir
--    ekran okumadığı için kayıtla gelen kurum her zaman 'klinik' görünüyordu.
--    clinic_signup_connect canlı tanımından (2026-10-23) yalnız tür satırları değişti.

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_category_check;
ALTER TABLE public.clinics ADD CONSTRAINT clinics_category_check
  CHECK (category = ANY (ARRAY['muayenehane'::text, 'klinik'::text, 'poliklinik'::text, 'hastane'::text, 'laboratuvar'::text]));

CREATE OR REPLACE FUNCTION public.clinic_signup_connect(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_p      record;
  v_member uuid;
  v_m      record;
  v_meta   jsonb;
  v_addr   text;
  v_type   text;
begin
  select p.id, p.user_type, p.clinic_id, p.full_name
    into v_p
    from public.profiles p
   where p.id = v_uid;
  if not found or v_p.user_type not in ('doctor', 'clinic_admin', 'clinic_secretary') then
    raise exception 'not a clinic user' using errcode = '42501';
  end if;

  begin
    v_member := public._clinic_connect(p_code, 'invite');
  exception when others then
    if sqlerrm ~* 'wrong code type' then
      v_member := public._clinic_connect(p_code, 'public_join');
    else
      raise;
    end if;
  end;

  select m.id, m.lab_id, m.status, m.member_profile_id, m.lab_clinic_id
    into v_m
    from public.clinic_lab_memberships m
   where m.id = v_member;

  if v_m.status in ('rejected', 'revoked') then
    raise exception 'request rejected' using errcode = 'P0001';
  end if;

  if v_m.member_profile_id = v_uid and v_m.lab_clinic_id is not null
     and v_m.lab_clinic_id is distinct from v_p.clinic_id then
    select u.raw_user_meta_data into v_meta from auth.users u where u.id = v_uid;
    v_addr := left(nullif(btrim(v_meta ->> 'address'), ''), 500);
    v_type := v_meta ->> 'clinic_type';
    if v_type is null or v_type not in ('muayenehane', 'klinik', 'poliklinik', 'hastane') then
      v_type := null;
    end if;
    update public.clinics c
       set address        = coalesce(c.address, v_addr),
           contact_person = coalesce(c.contact_person, nullif(btrim(v_p.full_name), '')),
           clinic_type    = coalesce(v_type, c.clinic_type),
           category       = coalesce(v_type, c.category)
     where c.id = v_m.lab_clinic_id;
  end if;

  return jsonb_build_object(
    'membership_id', v_m.id,
    'status',        v_m.status,
    'lab_name',      (select l.name from public.labs l where l.id = v_m.lab_id),
    'approved',      coalesce((select p.approval_status = 'approved' and p.clinic_id is not null
                                 from public.profiles p where p.id = v_uid), false)
  );
end;
$function$;
