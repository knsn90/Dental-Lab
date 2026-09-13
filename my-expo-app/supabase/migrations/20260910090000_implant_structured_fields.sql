-- ═══════════════════════════════════════════════════════════════════════════
-- İMPLANT BİLGİSİ — YAPISAL ALANLAR
--
-- SORUN: Yeni sipariş sihirbazı implant markası/türü/abutment/vida bilgisini
-- hekimden topluyordu ama:
--   • Adım 4'teki "İmplant markası" seçimi HİÇBİR yere yazılmıyordu (kolon yoktu),
--   • Diş bazlı detaylar yalnız order_items.notes içine düz metin olarak
--     kodlanıyordu ("İmplant detayları: 23 = Neodent|Bone Level|…"),
--   • Planlama ekranı order_items.notes'u SELECT bile etmiyordu.
-- Sonuç: lab/teknisyen implant bilgisini hiçbir ekranda göremiyordu.
--
-- ÇÖZÜM: work_orders üzerinde yapısal alanlar. notes'a yazma DEVAM EDİYOR
-- (geriye dönük uyumluluk + eski kayıtlar), okuma tarafı önce bu kolonlara
-- bakar, boşsa notes parse'ına düşer.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.work_orders
  add column if not exists implant_brand   text,
  add column if not exists implant_teeth   integer[],
  add column if not exists implant_details jsonb;

comment on column public.work_orders.implant_brand is
  'Vakanın genel implant markası (yeni sipariş sihirbazı adım 4). Diş bazlı marka için implant_details.';
comment on column public.work_orders.implant_teeth is
  'İmplant bulunan diş pozisyonları (FDI). Fiyata etki etmez, üretim/planlama bilgisidir.';
comment on column public.work_orders.implant_details is
  'Diş bazlı implant detayı: { "23": { "system": "Neodent", "type": "Bone Level", "abutment": "Ti-base", "screw": "Tekli" } }';

-- Planlama/detay ekranları "implantlı sipariş" filtresi çekebilsin.
create index if not exists idx_work_orders_implant_teeth
  on public.work_orders using gin (implant_teeth)
  where implant_teeth is not null;
