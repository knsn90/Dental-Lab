-- ============================================================
-- 20260711 — provas: API/UI'nin kullandığı eksik kolonlar (B2)
--
-- modules/provas API'si scheduled_date / prova_type / quota /
-- order_item_id / order_item_name bekliyor; tabloda yoktu → tüm prova
-- sorguları 400 dönüyordu (ekran hiç çalışmıyordu). Nullable eklenir,
-- mevcut satırlar etkilenmez. Idempotent.
-- ============================================================

ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS scheduled_date  date;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS prova_type      text;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS quota           integer;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS order_item_id   uuid REFERENCES public.order_items(id) ON DELETE SET NULL;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS order_item_name text;

CREATE INDEX IF NOT EXISTS idx_provas_scheduled_date ON public.provas (scheduled_date);
