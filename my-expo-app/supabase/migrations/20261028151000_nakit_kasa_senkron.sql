-- Nakit kasa (denetim yol haritası 2. dalga madde 8) · Görev 2: kendiliğinden kasa hareketi.
-- Spec: docs/superpowers/specs/2026-10-28-nakit-kasa-design.md §4.2 · Geri alma: supabase/rollbacks/20261028151000_nakit_kasa_senkron.down.sql
--
-- Nakit tahsilat (payments), nakit makbuz satırı (clinic_receipt_lines) ve nakit gider (expenses) kendi para
-- birimindeki çekmeceye (cash_accounts.is_drawer) hareket olarak yazılır; kaynak düzeltilince/silinince hareket
-- de düzelir/kalkar. Bağ (ref_type, ref_id) ile tekildir (ux_cash_movement_ref).
-- Kaynak tablolardaki mevcut fonksiyon ve tetikleyicilere dokunulmaz; yalnız yeni AFTER tetikleyicileri eklenir.
-- Kasa senkronu hata verse bile kaynak yazımı ASLA engellenmez (raise warning).

-- ─── Çekmece: lab + para birimi için aktif nakit kasa (yoksa tüm alanlar NULL) ──
create or replace function public._cash_drawer(p_lab uuid, p_currency text)
returns public.cash_accounts
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.*
    from public.cash_accounts a
   where a.lab_id = p_lab and a.currency = p_currency and a.is_drawer and a.is_active
   limit 1;
$$;

-- ─── Tek kaynak için olması gereken hareketi yaz / güncelle / sil ─────────────
-- Kural (spec §4.2):
--   payment             : nakit · makbuzdan doğmamış (receipt_id boş; o nakit makbuz satırında sayıldı) · fatura iptal değil
--   clinic_receipt_line : makbuz yöntemi nakit · satır başına (karışık TL+EUR makbuz iki hareket)
--   expense             : nakit · kurye / alış faturası / düzenli gider kökenli değil
--   hepsi               : kaynağın para biriminde aktif çekmece var · kaynak açılış anından SONRA oluşturuldu
create or replace function public._cash_sync(p_ref_type text, p_ref_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lab     uuid;
  v_cur     text;
  v_amt     numeric;
  v_date    date;
  v_created timestamptz;
  v_dir     text;
  v_cat     text;
  v_desc    text;
  v_ok      boolean;
  v_dr      public.cash_accounts;
begin
  if p_ref_type = 'payment' then
    select coalesce(p.lab_id, i.lab_id), coalesce(p.currency, i.currency), p.amount, p.payment_date, p.created_at,
           'giris', 'tahsilat', 'Tahsilat · ' || coalesce(i.invoice_number, ''),
           (p.payment_method = 'nakit' and p.receipt_id is null and i.status <> 'iptal')
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where p.id = p_ref_id;
  elsif p_ref_type = 'clinic_receipt_line' then
    select r.lab_id, l.currency, l.amount, r.receipt_date, l.created_at,
           'giris', 'tahsilat', 'Makbuz · ' || coalesce(c.name, ''),
           (r.payment_method = 'nakit')
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.clinic_receipt_lines l
      join public.clinic_receipts r on r.id = l.receipt_id
      left join public.clinics c on c.id = r.clinic_id
     where l.id = p_ref_id;
  elsif p_ref_type = 'expense' then
    select e.lab_id, e.currency, e.amount, e.expense_date, e.created_at,
           'cikis',
           case when e.salary_payment_id is not null or e.advance_id is not null or e.category = 'personel' then 'maas'
                when e.category in ('kira', 'malzeme', 'vergi') then e.category
                else 'odeme' end,
           'Gider · ' || coalesce(e.description, ''),
           (e.payment_method = 'nakit' and e.purchase_invoice_id is null and e.delivery_id is null
            and e.recurring_template_id is null)
      into v_lab, v_cur, v_amt, v_date, v_created, v_dir, v_cat, v_desc, v_ok
      from public.expenses e
     where e.id = p_ref_id;
  else
    return;
  end if;

  if v_ok is true and coalesce(v_amt, 0) > 0 then
    v_dr := public._cash_drawer(v_lab, v_cur);
    if v_dr.id is not null and v_created > coalesce(v_dr.opened_at, '-infinity'::timestamptz) then
      insert into public.cash_movements
             (lab_id, account_id, direction, amount, movement_date, category, description, ref_type, ref_id)
      values (v_lab, v_dr.id, v_dir, v_amt, v_date, v_cat, v_desc, p_ref_type, p_ref_id)
      on conflict (ref_type, ref_id) where ref_type is not null do update
         set lab_id        = excluded.lab_id,
             account_id    = excluded.account_id,
             direction     = excluded.direction,
             amount        = excluded.amount,
             movement_date = excluded.movement_date,
             category      = excluded.category,
             description   = excluded.description;
      return;
    end if;
  end if;

  -- Artık kasaya düşmemeli (yöntem değişti, kaynak silindi/iptal edildi, kasa yok…)
  delete from public.cash_movements where ref_type = p_ref_type and ref_id = p_ref_id;
end $$;

-- ─── Tetikleyiciler (AFTER, satır başına; hata kaynağı engellemez) ────────────
create or replace function public._trg_cash_sync_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  begin
    perform public._cash_sync('payment', v_id);
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (payment %): %', v_id, sqlerrm;
  end;
  return null;
end $$;

create or replace function public._trg_cash_sync_receipt_line()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  begin
    perform public._cash_sync('clinic_receipt_line', v_id);
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (clinic_receipt_line %): %', v_id, sqlerrm;
  end;
  return null;
end $$;

create or replace function public._trg_cash_sync_expense()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  begin
    perform public._cash_sync('expense', v_id);
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (expense %): %', v_id, sqlerrm;
  end;
  return null;
end $$;

-- Makbuzun yöntemi/tarihi değişince satırlarının hareketleri yeniden hesaplanır.
-- (Makbuz silinince satırlar cascade ile gider; satır tetikleyicisi hareketi siler.)
create or replace function public._trg_cash_sync_receipt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  begin
    for r in select l.id from public.clinic_receipt_lines l where l.receipt_id = new.id loop
      perform public._cash_sync('clinic_receipt_line', r.id);
    end loop;
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (clinic_receipt %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Fatura iptal edilince / iptali geri alınınca tahsilat hareketleri yeniden hesaplanır.
create or replace function public._trg_cash_sync_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  begin
    for r in select p.id from public.payments p where p.invoice_id = new.id loop
      perform public._cash_sync('payment', r.id);
    end loop;
  exception when others then
    raise warning 'nakit kasa senkronu atlandı (invoice %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

create trigger zz_cash_sync_payment
  after insert or update or delete on public.payments
  for each row execute function public._trg_cash_sync_payment();

create trigger zz_cash_sync_receipt_line
  after insert or update or delete on public.clinic_receipt_lines
  for each row execute function public._trg_cash_sync_receipt_line();

create trigger zz_cash_sync_receipt
  after update of payment_method, receipt_date on public.clinic_receipts
  for each row
  when (old.payment_method is distinct from new.payment_method or old.receipt_date is distinct from new.receipt_date)
  execute function public._trg_cash_sync_receipt();

create trigger zz_cash_sync_invoice
  after update of status on public.invoices
  for each row
  when (old.status is distinct from new.status)
  execute function public._trg_cash_sync_invoice();

create trigger zz_cash_sync_expense
  after insert or update or delete on public.expenses
  for each row execute function public._trg_cash_sync_expense();

-- İç fonksiyonlar istemciye kapalı (tetikleyiciler EXECUTE izni olmadan da çalışır)
revoke all on function public._cash_drawer(uuid, text) from public, anon, authenticated;
revoke all on function public._cash_sync(text, uuid) from public, anon, authenticated;
revoke all on function public._trg_cash_sync_payment() from public, anon, authenticated;
revoke all on function public._trg_cash_sync_receipt_line() from public, anon, authenticated;
revoke all on function public._trg_cash_sync_expense() from public, anon, authenticated;
revoke all on function public._trg_cash_sync_receipt() from public, anon, authenticated;
revoke all on function public._trg_cash_sync_invoice() from public, anon, authenticated;
