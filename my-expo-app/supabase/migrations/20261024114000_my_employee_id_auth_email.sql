-- my_employee_id(): eşleşme GİRİŞ (auth) e-postasıyla (denetim K1 ek — bağımsız inceleme C2, 2026-10-24).
--
-- Sorun: fonksiyon profiles.email / profiles.full_name'e bakıyordu; "Own profile updatable" kuralı
-- kullanıcının kendi profil satırını (ad, e-posta) değiştirmesine izin veriyor. Personel profil
-- adını ya da e-postasını iş arkadaşınınkine çevirip onun kaydıyla eşleşebilir, maaşını okuyabilir,
-- onun adına avans talebi açabilirdi.
--
-- Yeni kural: yalnız auth.users.email (kullanıcı değiştiremez) = personel kaydının e-postası.
-- Ad eşleşmesi KALDIRILDI. Ölçüm (tüm lab'lar): eşleşen 3 hesap aynı kalıyor, kaybeden 0.
-- Eşit iki kayıt varsa sıra kararlı (created_at, id).
-- Geri alma: supabase/rollbacks/20261024114000_my_employee_id_auth_email.down.sql

create or replace function public.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.profiles p on p.id = auth.uid()
  join auth.users u on u.id = auth.uid()
  where e.lab_id = p.lab_id and e.is_active
    and nullif(lower(btrim(e.email)), '') is not null
    and lower(btrim(e.email)) = lower(btrim(u.email))
  order by e.created_at, e.id
  limit 1;
$$;
