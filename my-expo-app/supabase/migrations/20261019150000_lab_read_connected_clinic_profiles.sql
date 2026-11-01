-- Lab kullanıcıları kendi labına bağlı KLİNİK hesaplarını okuyabilsin.
--
-- Sorun (2026-10-19): açık kayıtla (20261017193000_clinic_self_signup_flow) gelen
-- klinik hesaplarının profiles.lab_id'si NULL — çoklu-lab modeli gereği bağ
-- clinics.lab_id ve clinic_lab_memberships üzerinden. Lab okuma kuralı ise yalnız
-- `lab_id = get_my_lab_id()` bakıyordu → bu hesaplar lab'a GÖRÜNMÜYORDU:
--   • Yeni sipariş: tek hekimli klinikte yetkili (klinik_admin = hekimin kendisi)
--     seçicide çıkmıyor, kullanıcı mecburen ikinci bir hekim kaydı açıyordu.
--   • Kullanıcılar sayfasında da aynı hesaplar eksik kalıyordu.
--
-- Kapsam: yalnız klinik tarafı hesap türleri ve yalnız profile_in_my_lab(id)
-- doğruysa (hesabın kliniği bu labın CRM satırı ya da onaylı/aktif üyelik).
-- profile_in_my_lab SECURITY DEFINER — profiles UPDATE kurallarında zaten
-- kullanılıyor; profiles içinden profiles okuduğu hâlde politika döngüsü yok.
-- Başka labın hesapları ve başka labın personeli GÖRÜNMEZ.

drop policy if exists lab_read_connected_clinic_profiles on public.profiles;

create policy lab_read_connected_clinic_profiles on public.profiles
  for select
  to authenticated
  using (
    public.is_lab_user()
    and user_type in ('doctor', 'clinic_admin', 'clinic_secretary')
    and public.profile_in_my_lab(id)
  );
