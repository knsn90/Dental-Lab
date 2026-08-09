-- ============================================================
-- 20260718120000 — stock_items paket içeriği (pack_size / content_unit)
--
-- Sorun: 50gr'lık kavanoz stokta "1 Adet" ama her işte 1-2 gr kullanılıyor;
-- bir adedin tamamı tüketilmiyor. Adet bazlı düşüm gerçeği yansıtmıyor.
--
-- Çözüm (kullanıcı kararı: "paket içeriği" modeli): kalem adet/kavanoz olarak
-- sayılmaya devam eder; opsiyonel `pack_size` (örn 50) + `content_unit` (örn gr)
-- ile "bir paket kaç birim içerir" bilgisi tutulur. Tüketim içerik biriminde
-- (gr) girilir; stoktan kesirli adet (qty ÷ pack_size) düşer.
--
-- pack_size NULL → bugünkü davranış BİREBİR korunur (adet=adet düşüm). Additive.
-- ============================================================

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS pack_size    numeric,
  ADD COLUMN IF NOT EXISTS content_unit text;

COMMENT ON COLUMN public.stock_items.pack_size IS
  'Paket içeriği miktarı (örn 50). NULL = adet=adet düşüm (paketsiz kalem).';
COMMENT ON COLUMN public.stock_items.content_unit IS
  'Paket içerik birimi (gr, ml…). pack_size ile birlikte anlamlıdır; tüketim bu birimde girilir.';

-- ── Backfill ──────────────────────────────────────────────────────────
-- İsmi "…-50GR", "100 ML", "250gr" gibi biten ve birimi adet-benzeri olan
-- kalemlerde pack_size + content_unit'ı isimden ayrıştır. Yalnız pack_size
-- boş olanlar (idempotent). g→gr, l→lt normalize edilir.
UPDATE public.stock_items si
SET pack_size    = m.num,
    content_unit = CASE lower(m.unit_raw)
                     WHEN 'g' THEN 'gr'
                     WHEN 'l' THEN 'lt'
                     ELSE lower(m.unit_raw)
                   END,
    updated_at   = NOW()
FROM (
  SELECT id,
         -- PostgreSQL ARE: word-boundary = \y (\b burada backspace demektir!)
         regexp_match(name, '(\d+(?:[.,]\d+)?)\s*(gr|g|ml|mg|kg|cc|lt|l)\y', 'i') AS mm
  FROM public.stock_items
) x
CROSS JOIN LATERAL (
  SELECT NULLIF(replace(x.mm[1], ',', '.'), '')::numeric AS num,
         x.mm[2] AS unit_raw
) m
WHERE si.id = x.id
  AND x.mm IS NOT NULL
  AND m.num > 0
  AND si.pack_size IS NULL
  AND lower(coalesce(si.unit, '')) IN
      ('adet','ad','kutu','paket','şişe','sise','kavanoz','tüp','tup');
