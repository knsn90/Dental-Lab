-- ═══════════════ FIX: kullanıcı silinemiyor — user_consents append-only cascade'i engelliyor ═══════════════
-- user_consents.user_id → auth.users ON DELETE CASCADE, ama tg_user_consents_immutable
-- trigger'ı HER DELETE'i engelliyordu → rıza kaydı olan bir kullanıcı silinince cascade
-- DELETE bloklanıp tüm silme başarısız oluyordu (admin-delete-user sessizce hata döndürüyordu).
-- Çözüm: hesap (auth.users) silinirken oluşan CASCADE DELETE'e izin ver (KVKK/GDPR silme hakkı).
-- PG'de RI cascade parent silindikten SONRA çalışır → child trigger'da parent artık YOKTUR;
-- bunu ayraç yapıyoruz. Doğrudan/elle DELETE (parent varken) ve tüm UPDATE'ler hâlâ engelli
-- → append-only tampering koruması korunur.
create or replace function public.tg_user_consents_immutable()
returns trigger language plpgsql as $function$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  raise exception 'user_consents is append-only (attempted %)', tg_op using errcode='42501';
end $function$;
