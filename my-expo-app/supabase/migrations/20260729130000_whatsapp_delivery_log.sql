-- 20260729130000 — WhatsApp teslim durumu takibi (sent/delivered/read/failed).
-- Meta webhook `value.statuses[]` callback'lerini whatsapp-webhook edge fn buraya yazar.
-- Teşhiste kullanıldı: error_code 131042 = WABA'da ödeme yöntemi yok → yeni konuşmalar düşer.
-- Yalnız edge fn (service role) yazar; RLS açık, public policy yok.

create table if not exists public.whatsapp_delivery_log (
  id            uuid primary key default gen_random_uuid(),
  wamid         text,
  recipient     text,
  status        text,          -- sent | delivered | read | failed
  error_code    text,
  error_title   text,
  error_message text,
  raw           jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wa_delivery_wamid     on public.whatsapp_delivery_log(wamid);
create index if not exists idx_wa_delivery_recipient on public.whatsapp_delivery_log(recipient, created_at desc);
alter table public.whatsapp_delivery_log enable row level security;
