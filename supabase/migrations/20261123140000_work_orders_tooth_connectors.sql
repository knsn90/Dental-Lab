-- Diş şeması köprü bağlantıları (exocad DentalDB konnektörü).
-- Komşu iki diş arasındaki bağlantı = bu iki diş birlikte tasarlanır (köprü / blok).
-- Biçim: [[11,12],[12,13]] — her çift FDI numarası, sıra önemsiz.
-- Plan ekranında belirlenir; sipariş detayı ve istasyon salt okunur gösterir.
-- Ekleyici; mevcut veri ve RLS değişmez.

alter table public.work_orders
  add column if not exists tooth_connectors jsonb default null;
-- null = henüz belirlenmedi (plan ekranı köprü önerisi gösterir); [] = bilerek bağlantısız.

comment on column public.work_orders.tooth_connectors is
  'Komşu diş bağlantıları (köprü/blok): [[a,b],...] FDI çiftleri. Plan ekranında belirlenir.';

-- Geri alma:
-- alter table public.work_orders drop column if exists tooth_connectors;
