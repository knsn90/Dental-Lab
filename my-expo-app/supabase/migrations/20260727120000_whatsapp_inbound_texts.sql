-- WhatsApp'tan fotoğraftan AYRI gelen metin mesajlarını kısa süreli tamponlar.
-- Klinik önce/ayrı bir metin yazıp sonra fotoğraf gönderdiğinde, fotoğraf işlenirken
-- son ~15 dk içindeki tüketilmemiş metinler çekilip iş emri bağlamına eklenir.
-- Yalnız edge fonksiyonları (service role) yazar/okur → RLS açık, public policy yok.

create table if not exists public.whatsapp_inbound_texts (
  id           uuid primary key default gen_random_uuid(),
  lab_id       uuid not null references public.labs(id) on delete cascade,
  sender_phone text,
  body         text not null,
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz
);

create index if not exists idx_wa_inbound_texts_lookup
  on public.whatsapp_inbound_texts (lab_id, sender_phone, consumed_at, created_at);

alter table public.whatsapp_inbound_texts enable row level security;
