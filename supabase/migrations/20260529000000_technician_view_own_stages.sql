-- ════════════════════════════════════════════════════════════════════════════
-- 20260529 — Teknisyen kendi order_stages kayıtlarını okuyabilsin
--
-- Problem: /history sayfası boş — teknisyen "Tamamladığım işler" altında
-- kendi tamamladığı stage'leri göremiyor. RLS politikası eksik / yetersiz
-- olabilir. Idempotent koruyucu: teknisyen technician_id = auth.uid() olan
-- satırlara SELECT izin verir.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS technician_view_own_stages ON public.order_stages;
CREATE POLICY technician_view_own_stages
  ON public.order_stages FOR SELECT
  USING (
    technician_id = auth.uid()
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
