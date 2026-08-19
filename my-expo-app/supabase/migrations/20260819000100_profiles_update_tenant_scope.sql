-- Çapraz-kiracı YAZMA açığını kapatır.
--
-- Sorun: profiles üzerindeki admin_update_all_profiles (USING is_admin_user()) ve
-- lab_manager_update_doctor_approval (USING is_lab_manager()) politikalarında lab
-- kısıtı YOKTU. is_admin_user() yalnız role bakar; 'admin' ise lab-başına bir roldür.
-- Sonuç: A labının admini, id'sini bildiği B labı profilini UPDATE edebiliyordu.
-- (id'leri de admin-list-users edge fonksiyonundaki okuma sızıntısı veriyordu.)
--
-- Kiracılık ÜÇ ayaklı olmak zorunda: hekim/klinik profillerinin lab_id'si NULL'dur,
-- bağ klinik üzerinden kurulur. Düz lab_id eşitliği hekim onayını kırardı.
create or replace function public.profile_in_my_lab(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from profiles p
    where p.id = p_profile
      and get_my_lab_id() is not null
      and (
            p.lab_id = get_my_lab_id()
         or exists (select 1 from clinics c
                     where c.id = p.clinic_id and c.lab_id = get_my_lab_id())
         or exists (select 1 from clinic_lab_memberships m
                     where m.lab_id = get_my_lab_id()
                       and m.status in ('active','approved')
                       and (m.member_profile_id = p.id or m.member_clinic_id = p.clinic_id))
      )
  );
$$;

-- WITH CHECK bilinçli yazılmadı: Postgres o durumda USING'i yeni satıra da uygular,
-- yani profili başka laba TAŞIMAK da engellenmiş olur.
drop policy if exists "admin_update_all_profiles" on public.profiles;
create policy "admin_update_own_lab_profiles" on public.profiles
  for update using (is_admin_user() and profile_in_my_lab(id));

drop policy if exists "lab_manager_update_doctor_approval" on public.profiles;
create policy "lab_manager_update_doctor_approval" on public.profiles
  for update using (is_lab_manager() and profile_in_my_lab(id));
