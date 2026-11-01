-- Nakit kasa (denetim yol haritası 2. dalga madde 8) · Görev 1: şema, yetki, düzenli gider işareti.
-- Spec: docs/superpowers/specs/2026-10-28-nakit-kasa-design.md · Plan: docs/superpowers/plans/2026-10-28-nakit-kasa.md
-- Geri alma: supabase/rollbacks/20261028150000_nakit_kasa_sema.down.sql
--
-- Kaynak tablolardaki (payments, clinic_receipts, expenses) mevcut fonksiyon/tetikleyicilere dokunulmaz;
-- expenses'a yalnız bir sütun + BEFORE INSERT tetikleyicisi eklenir.

-- ─── 1. Kasa hesapları: çekmece işareti + kesim anı ───────────────────────────
-- Tenant lab_id her zaman labs(id)'e FK (iki tablo da 0 satır; 024'te FK yoktu).
alter table public.cash_accounts
  add constraint cash_accounts_lab_id_fkey foreign key (lab_id) references public.labs(id) on delete cascade;
alter table public.cash_movements
  add constraint cash_movements_lab_id_fkey foreign key (lab_id) references public.labs(id) on delete cascade;

alter table public.cash_accounts
  add column is_drawer boolean not null default false,
  add column opened_at timestamptz;

comment on column public.cash_accounts.is_drawer is
  'Nakit kasa (çekmece): nakit tahsilat/gider buraya kendiliğinden düşer. Yalnız cash_open_drawer() açar.';
comment on column public.cash_accounts.opened_at is
  'Açılış sayımı anı: bu andan ÖNCE oluşturulmuş kaynak kayıtlar kasaya yazılmaz.';

-- Lab + para birimi başına tek aktif çekmece
create unique index ux_cash_drawer on public.cash_accounts (lab_id, currency) where is_drawer and is_active;

-- ─── 2. Kasa hareketleri: yeni kategoriler + kaynak tekilliği ─────────────────
alter table public.cash_movements drop constraint cash_movements_category_check;
alter table public.cash_movements add constraint cash_movements_category_check
  check (category = any (array['tahsilat','odeme','maas','kira','malzeme','vergi','diger','transfer','sayim']));

-- Bir kaynak kaydın en fazla bir otomatik hareketi olur
create unique index ux_cash_movement_ref on public.cash_movements (ref_type, ref_id) where ref_type is not null;

-- ─── 3. Sayım kayıtları ───────────────────────────────────────────────────────
create table public.cash_counts (
  id              uuid primary key default gen_random_uuid(),
  lab_id          uuid not null references public.labs(id) on delete cascade,
  account_id      uuid not null references public.cash_accounts(id) on delete cascade,
  kind            text not null check (kind in ('acilis','sayim')),
  counted_at      timestamptz not null default now(),
  counted_amount  numeric not null check (counted_amount >= 0),
  expected_amount numeric,
  diff            numeric not null default 0,
  movement_id     uuid references public.cash_movements(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_cash_counts_account on public.cash_counts (account_id, counted_at desc);
create index idx_cash_counts_lab on public.cash_counts (lab_id);

alter table public.cash_counts enable row level security;
revoke all on public.cash_counts from anon, authenticated;
grant select on public.cash_counts to authenticated;   -- yazma yalnız RPC (DEFINER)

create policy cash_counts_read on public.cash_counts for select to authenticated
  using (lab_id = public.get_my_lab_id()
         and (public.has_permission('view_cash') or public.has_permission('manage_cash')));

-- ─── 4. Yetki: Kasa & Banka izni (view_cash / manage_cash) olmayan kasayı görmez ─
-- Bilerek is_platform_admin() YOK: platform yöneticisi aynı zamanda lab sahibi; kasa ekranı lab süzgeci
-- uygulamadığı için başka labların kasaları listeye düşerdi. Admin rolü manage_cash'e zaten sahip.
drop policy cash_accounts_lab_own on public.cash_accounts;
drop policy cash_movements_lab_own on public.cash_movements;

create policy cash_accounts_read on public.cash_accounts for select to authenticated
  using (lab_id = public.get_my_lab_id()
         and (public.has_permission('view_cash') or public.has_permission('manage_cash')));
-- Çekmece yalnız RPC ile açılır; açılış tutarı ve kesim anı istemciden değiştirilemez
create policy cash_accounts_insert on public.cash_accounts for insert to authenticated
  with check (not is_drawer and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'));
create policy cash_accounts_update on public.cash_accounts for update to authenticated
  using (not is_drawer and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'))
  with check (not is_drawer and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'));
create policy cash_accounts_delete on public.cash_accounts for delete to authenticated
  using (not is_drawer and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'));

create policy cash_movements_read on public.cash_movements for select to authenticated
  using (lab_id = public.get_my_lab_id()
         and (public.has_permission('view_cash') or public.has_permission('manage_cash')));
-- İstemci yalnız elle hareket yazar (ref_type boş, sayım kategorisi değil) ve yalnız kendi lab'ının hesabına.
-- Otomatik hareketler (ref_type dolu) DEFINER fonksiyonlarla yazılır.
create policy cash_movements_insert on public.cash_movements for insert to authenticated
  with check (ref_type is null and category <> 'sayim'
              and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash')
              and exists (select 1 from public.cash_accounts a where a.id = account_id and a.lab_id = cash_movements.lab_id));
create policy cash_movements_update on public.cash_movements for update to authenticated
  using (ref_type is null and category <> 'sayim'
         and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'))
  with check (ref_type is null and category <> 'sayim'
              and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash')
              and exists (select 1 from public.cash_accounts a where a.id = account_id and a.lab_id = cash_movements.lab_id));
create policy cash_movements_delete on public.cash_movements for delete to authenticated
  using (ref_type is null and category <> 'sayim'
         and lab_id = public.get_my_lab_id() and public.has_permission('manage_cash'));

-- ─── 5. Düzenli giderden üretilen gider işareti ───────────────────────────────
-- generate_recurring_expenses() notlara ' [otomatik · şablon: <uuid>]' yazar. Bu gider kasadan ödenmez.
-- FK yok bilerek: şablon silinince ON DELETE SET NULL bir UPDATE doğurur ve gideri kasaya düşürürdü.
alter table public.expenses add column recurring_template_id uuid;
comment on column public.expenses.recurring_template_id is
  'Düzenli gider şablonundan üretildiyse şablon id (köken işareti, FK değil). Nakit kasaya düşmez.';

create or replace function public._expense_recurring_mark()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.recurring_template_id is null and new.notes is not null then
    new.recurring_template_id := (substring(new.notes from '\[otomatik · şablon: ([0-9a-fA-F-]{36})\]'))::uuid;
  end if;
  return new;
exception when others then
  return new;   -- bozuk işaret gider kaydını asla engellemez
end $$;

create trigger trg_expense_recurring_mark
  before insert on public.expenses
  for each row execute function public._expense_recurring_mark();

update public.expenses
   set recurring_template_id = (substring(notes from '\[otomatik · şablon: ([0-9a-fA-F-]{36})\]'))::uuid
 where recurring_template_id is null
   and notes ~ '\[otomatik · şablon: [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\]';
