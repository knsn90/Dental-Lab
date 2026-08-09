-- WhatsApp bot konuşma oturumu (state machine) — menü + adım-adım akış + insan devri.
--
-- Her (lab_id, sender_phone) için TEK satır: konuşmanın nerede olduğunu tutar.
--   mode  = 'bot'  → bot menü/akış yönetir
--   mode  = 'human'→ destek devri; bot TAMAMEN susar, personel kendi WhatsApp'ından
--                     yazışır. N saat sessizlik (edge fn) veya personel "Sohbeti bitir"
--                     dediğinde 'bot'a döner.
--   flow  = null | 'new_order' | 'status' | 'add_media'  → aktif akış
--   step  = akış içindeki adım anahtarı (ör. 'patient', 'work', 'collect')
--   draft = adım-adım yeni siparişte biriken alanlar
--   context = akışa özel bağlam (ör. hedef work_order_id, biriken medya yolları)
--
-- Yalnız edge fonksiyonları (service role) yazar. Lab yöneticileri gelecekteki
-- "Destek sohbetleri" ekranından okuyabilsin + kapatabilsin diye SELECT/UPDATE
-- politikaları eklendi (super-admin + o labın manager/admin'i).

create table if not exists public.whatsapp_sessions (
  id           uuid primary key default gen_random_uuid(),
  lab_id       uuid not null references public.labs(id) on delete cascade,
  sender_phone text not null,
  mode         text not null default 'bot',
  flow         text,
  step         text,
  draft        jsonb not null default '{}'::jsonb,
  context      jsonb not null default '{}'::jsonb,
  human_since  timestamptz,
  last_msg_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (lab_id, sender_phone)
);

create index if not exists idx_wa_sessions_lookup
  on public.whatsapp_sessions (lab_id, sender_phone);
create index if not exists idx_wa_sessions_human
  on public.whatsapp_sessions (mode, last_msg_at) where mode = 'human';

alter table public.whatsapp_sessions enable row level security;

-- Lab yöneticisi / super-admin okuyabilir (destek sohbetleri konsolu için).
drop policy if exists wa_sessions_lab_read on public.whatsapp_sessions;
create policy wa_sessions_lab_read on public.whatsapp_sessions
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin'
             or (p.user_type = 'lab' and p.role in ('manager', 'admin')
                 and p.lab_id = whatsapp_sessions.lab_id))
    )
  );

-- Aynı yetkililer "Sohbeti bitir" için güncelleyebilir (mode='bot' vb.).
drop policy if exists wa_sessions_lab_update on public.whatsapp_sessions;
create policy wa_sessions_lab_update on public.whatsapp_sessions
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin'
             or (p.user_type = 'lab' and p.role in ('manager', 'admin')
                 and p.lab_id = whatsapp_sessions.lab_id))
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.user_type = 'admin'
             or (p.user_type = 'lab' and p.role in ('manager', 'admin')
                 and p.lab_id = whatsapp_sessions.lab_id))
    )
  );
