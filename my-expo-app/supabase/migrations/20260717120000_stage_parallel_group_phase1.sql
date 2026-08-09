-- 20260717120000 — Paralel şerit (lane) · FAZ 1: Şema (additive, NO-OP)
-- ─────────────────────────────────────────────────────────────────────────────
-- Amaç: Tek siparişte item-grubu bazlı PARALEL aşama şeritleri. Örn. aynı hasta:
--   • 15-16 Ti-Base Zirkon Kron/Köprü  → lane 1 (kendi akışı/zamanı/ilerlemesi)
--   • 26   Inlay/Onlay Cam Seramik     → lane 2 (bağımsız akış)
-- Hekim tek siparişte hepsini görür; sipariş başlığı = TÜM şeritlerin toplamı.
--
-- NEDEN `parallel_group` DEĞİL, yeni `lane`:
--   Canlıda `order_stages.parallel_group int` kolonu ZATEN başka bir anlamla
--   yarım yapılmıştı — tek workflow İÇİNDE eşzamanlı yürüyen istasyonlar (ETA
--   tahmini + kanban "‖ PARALEL" rozeti). Bu "işlem şeridi"nden FARKLI bir eksen
--   (biri eşzamanlı küme, diğeri ardışık dizi). Çakışmayı önlemek + o dormant
--   özelliği bozmamak için şeride ayrı `lane` kolonu açılır; parallel_group
--   özgün anlamıyla (NULL) bırakılır (kanban rozeti gizli kalır).
--
-- GÜVENLİK: Tamamen additive. Tüm mevcut aşamalar lane=1 → yeni
-- UNIQUE(work_order_id, lane, sequence_order) eski UNIQUE(work_order_id,
-- sequence_order) ile birebir aynı satır kümesini korur (NO-OP). RPC'ler ve
-- client bu fazda DEĞİŞMEZ; şerit-farkındalığı Faz 2-4'te gelir.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 0) DÜZELTME: parallel_group özgün (dormant) haline geri — kanban "‖ PARALEL"
--    rozeti tüm kartlarda görünmesin (regresyon geri alımı). Bu kolon işlem
--    şeridi DEĞİL; ETA eşzamanlılık kavramı için ayrılmış kalır.
ALTER TABLE public.order_stages ALTER COLUMN parallel_group DROP NOT NULL;
ALTER TABLE public.order_stages ALTER COLUMN parallel_group DROP DEFAULT;
UPDATE public.order_stages SET parallel_group = NULL WHERE parallel_group = 1;

-- Eski (Phase-1 taslağı) parallel_group tabanlı unique + index'i kaldır
ALTER TABLE public.order_stages
  DROP CONSTRAINT IF EXISTS order_stages_work_order_id_parallel_group_sequence_order_key;
ALTER TABLE public.order_stages
  DROP CONSTRAINT IF EXISTS order_stages_work_order_id_sequence_order_key;
DROP INDEX IF EXISTS public.idx_order_stages_group;

-- 1) DEDICATED şerit kolonu: order_stages.lane (default 1 → tek şerit)
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS lane integer NOT NULL DEFAULT 1;

-- 2) UNIQUE(work_order_id, sequence_order) → UNIQUE(work_order_id, lane, sequence_order)
--    DEFERRABLE INITIALLY DEFERRED KORUNUR (renumber negation-trick buna bağlı:
--    order_stage_add/remove, advance MANAGER_REVIEW bump vb.)
ALTER TABLE public.order_stages
  ADD CONSTRAINT order_stages_work_order_id_lane_sequence_order_key
  UNIQUE (work_order_id, lane, sequence_order) DEFERRABLE INITIALLY DEFERRED;

-- 3) Şerit-kapsamlı kuyruk/sıra index'i
CREATE INDEX IF NOT EXISTS idx_order_stages_lane
  ON public.order_stages (work_order_id, lane, sequence_order);

-- 4) order_items.lane: hangi işlem (item) hangi şeride ait (default 1)
--    Backfill: mevcut tüm item'lar tek şerit (1) → bugünkü davranış.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS lane integer NOT NULL DEFAULT 1;

COMMIT;

-- ── Doğrulama notu ────────────────────────────────────────────────────────────
--   • order_stages.lane = 1, parallel_group = NULL (tek şerit, rozet gizli).
--   • order_items.lane = 1.
--   • Faz 2 (triage): item→lane atama + N paralel akış üretimi (RPC + UI).
--   • Faz 3: stage RPC'leri "sipariş başına 1 aktif" → "lane başına 1 aktif".
--   • Faz 4/5: client per-lane render + sipariş başlığı = şeritlerin toplamı.
