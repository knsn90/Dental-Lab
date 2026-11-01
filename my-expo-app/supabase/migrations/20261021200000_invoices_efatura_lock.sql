-- e-Faturası kesilmiş faturayı kilitle (2026-10-21, kullanıcı onaylı)
--
-- Resmi e-fatura (ETTN) kesildikten sonra Siman faturası ondan AYRIŞAMAZ:
--   • taslağa alınamaz, iptal edilemez, silinemez
--   • tutar / KDV / döviz / klinik / ETTN değiştirilemez
--   • kalemleri eklenemez, değiştirilemez, silinemez
-- Tahsilat akışı (kesildi → kısmi → ödendi) ve e-fatura durum alanları serbest.
-- İstisna: e-fatura Luca'da İPTAL edildiyse (efatura_status = 'cancelled') kilit kalkar.
-- Sunucu süreçleri (service_role / postgres — efatura-luca, bakım) kilide takılmaz;
-- kilit istemciden (authenticated) gelen değişiklikler içindir. Arayüz de aynı kuralı uygular.

create or replace function public._invoice_efatura_locked(p_uuid uuid, p_status text)
returns boolean language sql immutable as $$
  select p_uuid is not null and coalesce(p_status, '') <> 'cancelled'
$$;

create or replace function public.invoices_efatura_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if public._invoice_efatura_locked(old.efatura_uuid, old.efatura_status) then
      raise exception 'e-Faturası kesilmiş fatura silinemez' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if not public._invoice_efatura_locked(old.efatura_uuid, old.efatura_status) then
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('taslak', 'iptal') then
    raise exception 'e-Faturası kesilmiş fatura taslağa alınamaz veya iptal edilemez — iptal/iade Luca''dan yapılır'
      using errcode = 'P0001';
  end if;

  if (new.subtotal, new.tax_rate, new.tax_amount, new.total, new.currency, new.clinic_id, new.efatura_uuid)
     is distinct from
     (old.subtotal, old.tax_rate, old.tax_amount, old.total, old.currency, old.clinic_id, old.efatura_uuid) then
    raise exception 'e-Faturası kesilmiş faturanın tutarı, KDV''si veya kliniği değiştirilemez' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- zz_: aa_enforce_invoice_totals'tan SONRA çalışsın (son hâli görsün).
drop trigger if exists zz_invoices_efatura_lock on public.invoices;
create trigger zz_invoices_efatura_lock
  before update or delete on public.invoices
  for each row execute function public.invoices_efatura_lock();

create or replace function public.invoice_items_efatura_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_locked boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  select public._invoice_efatura_locked(i.efatura_uuid, i.efatura_status) into v_locked
    from public.invoices i where i.id = coalesce(new.invoice_id, old.invoice_id);
  if coalesce(v_locked, false) then
    raise exception 'e-Faturası kesilmiş faturanın kalemleri değiştirilemez' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists zz_invoice_items_efatura_lock on public.invoice_items;
create trigger zz_invoice_items_efatura_lock
  before insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_efatura_lock();
