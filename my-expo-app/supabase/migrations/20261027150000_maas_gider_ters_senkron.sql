-- 20261027150000_maas_gider_ters_senkron.sql
-- Maaş ödemesi ↔ gider kaydı: ters yönlü senkron (gider → maaş) + tek seferlik düzeltme.
--
-- Neden: trg_salary_to_expense maaş ödemesini gidere yansıtıyor (ekle/güncelle/sil), ama
-- Giderler'de maaş gideri düzeltilince (tarih, ödeme yöntemi) maaş kaydı güncellenmiyordu.
-- Hesap Dökümü ve Maaşlar listesi maaş kaydını okuduğu için Giderler'den farklı tarih
-- gösteriyordu (canlıda 14 kaydın 1'i: gider 2026-06-04, maaş kaydı 2026-10-04; kullanıcı:
-- Giderler doğru).
--   * trg_expense_to_salary: maaşa bağlı giderde tarih / yöntem değişince maaş kaydına yazar.
--     Yöntem yalnız maaşın izinli değerlerindeyse (nakit/havale/kart) taşınır; çek/diğer
--     maaş kaydını bozmaz. Tutar TAŞINMAZ (brüt/kesinti bütünlüğü maaş ekranında kalır).
--   * Döngü yok: maaş tetikleyicisi gideri aynı değerle günceller → bu tetikleyicinin WHEN'i
--     (tarih/yöntem farkı) tutmaz.
--   * Tek seferlik: ayrışmış maaş tarihleri gider tarihine çekilir.
-- Geri alma: rollbacks/20261027150000_maas_gider_ters_senkron.down.sql

create or replace function public.sync_expense_to_salary()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.salary_payments sp
     set payment_date   = NEW.expense_date,
         payment_method = case when NEW.payment_method in ('nakit', 'havale', 'kart')
                               then NEW.payment_method else sp.payment_method end
   where sp.id = NEW.salary_payment_id
     and (sp.payment_date is distinct from NEW.expense_date
          or (NEW.payment_method in ('nakit', 'havale', 'kart')
              and sp.payment_method is distinct from NEW.payment_method));
  return null;
end;
$function$;

revoke all on function public.sync_expense_to_salary() from public, anon, authenticated;

drop trigger if exists trg_expense_to_salary on public.expenses;
create trigger trg_expense_to_salary
  after update of expense_date, payment_method on public.expenses
  for each row
  when (NEW.salary_payment_id is not null
        and (OLD.expense_date is distinct from NEW.expense_date
             or OLD.payment_method is distinct from NEW.payment_method))
  execute function public.sync_expense_to_salary();

-- Tek seferlik: ayrışmış maaş tarihleri gider tarihine (kullanıcı: Giderler doğru).
update public.salary_payments sp
   set payment_date = e.expense_date
  from public.expenses e
 where e.salary_payment_id = sp.id
   and e.expense_date is distinct from sp.payment_date;
