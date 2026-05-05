-- 071: Lab-wide settings table
-- Genel + Lab'a özel yapılandırma ayarları

create table if not exists public.lab_settings (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid not null references public.labs(id) on delete cascade,

  -- Genel ayarlar
  default_currency  text not null default 'TRY',       -- TRY, USD, EUR, GBP
  week_start        text not null default 'monday',     -- monday | sunday
  theme_mode        text not null default 'light',      -- light | dark | system

  -- Lab'a özel ayarlar
  order_prefix        text not null default 'LAB',         -- sipariş numarası ön eki
  default_tax_rate    numeric(5,2) not null default 20.00, -- varsayılan KDV oranı (%)
  working_hours_start time not null default '08:00',       -- mesai başlangıç
  working_hours_end   time not null default '18:00',       -- mesai bitiş
  auto_logout_minutes int not null default 0,              -- 0 = kapalı, 15/30/60
  items_per_page      int not null default 50,             -- sayfa başına kayıt

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint lab_settings_lab_unique unique (lab_id)
);

-- RLS
alter table public.lab_settings enable row level security;

create policy "lab_settings_read"
  on public.lab_settings for select
  using (lab_id = current_setting('app.current_lab_id', true)::uuid);

create policy "lab_settings_write"
  on public.lab_settings for all
  using (lab_id = current_setting('app.current_lab_id', true)::uuid);

-- Seed default row for existing lab
insert into public.lab_settings (lab_id)
select id from public.labs
on conflict (lab_id) do nothing;

-- Updated_at trigger
create or replace function public.lab_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_lab_settings_updated_at
  before update on public.lab_settings
  for each row execute function public.lab_settings_updated_at();
