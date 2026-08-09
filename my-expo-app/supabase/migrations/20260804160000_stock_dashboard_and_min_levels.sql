-- ============================================================================
-- Stok panosu: uyarı şeridi + otomatik minimum seviye
--
-- 1) stock_dashboard_alerts() — panonun "işlem bekleyenler" satırları tek
--    çağrıda gelir (açık sayım, kayıtsız aşama, profilsiz seçim, minimumsuz
--    kalem, SKT yaklaşan). Ekranda beş ayrı sorgu kovalamak yerine tek RPC.
--
-- 2) Otomatik minimum: 91 kalemin 89'unda minimum yoktu. Minimum yoksa kalem
--    asla "kritik" olmuyor, sipariş önerisine girmiyor, pano hep %100 sağlıklı
--    görünüyordu. Referans olarak GÜNCEL miktar alınamaz — eşik stok tükendikçe
--    onunla birlikte düşer ve hiç tetiklenmez. Bu yüzden referans, alış toplamı
--    ile mevcut miktarın büyüğü (sabit taban).
--
-- min_auto: değeri sistem mi koydu, kullanıcı mı. Kullanıcı elle girdiğinde
-- false olur ve otomatik hesap bir daha üzerine yazmaz.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stock_dashboard_alerts()
RETURNS TABLE (
  verification_id      uuid,
  verification_total   int,
  verification_counted int,
  stages_missing       int,
  pending_no_profile   int,
  items_without_min    int,
  expiring_soon        int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH lab AS (SELECT public.get_my_lab_id() AS id),
  ver AS (
    SELECT v.id FROM public.inventory_verifications v, lab
     WHERE v.lab_id = lab.id AND v.status = 'draft'
     ORDER BY v.created_at DESC LIMIT 1
  )
  SELECT
    (SELECT id FROM ver),
    (SELECT count(*)::int FROM public.inventory_verification_lines l WHERE l.verification_id = (SELECT id FROM ver)),
    (SELECT count(*)::int FROM public.inventory_verification_lines l
      WHERE l.verification_id = (SELECT id FROM ver) AND l.physical_qty IS NOT NULL),
    (SELECT count(*)::int
       FROM public.order_stages os
       JOIN public.work_orders wo ON wo.id = os.work_order_id
       JOIN public.lab_stations st ON st.id = os.station_id, lab
      WHERE wo.lab_id = lab.id AND os.status = 'tamamlandi'
        AND COALESCE(st.consumes_materials,false)
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements m
           WHERE m.stage_id = os.id
             AND upper(COALESCE(m.type,'')) IN ('OUT','WASTE')
             AND NOT COALESCE(m.is_reversed,false))),
    (SELECT count(*)::int FROM public.stage_material_selections s, lab
      WHERE s.lab_id = lab.id AND s.status = 'pending_no_profile'),
    (SELECT count(*)::int FROM public.stock_items si, lab
      WHERE si.lab_id = lab.id AND si.is_active AND NOT (COALESCE(si.min_quantity,0) > 0)),
    (SELECT count(*)::int FROM public.fifo_layers f, lab
      WHERE f.lab_id = lab.id AND f.qty_remaining > 0
        AND f.expiry_date IS NOT NULL
        AND f.expiry_date <= (CURRENT_DATE + 60));
$fn$;

GRANT EXECUTE ON FUNCTION public.stock_dashboard_alerts() TO authenticated, service_role;

-- ── Otomatik minimum seviye ────────────────────────────────────────────────
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS min_auto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stock_items.min_auto IS
  'true = minimum seviye sistemce (referansın %10''u) atandı, kullanıcı girmedi';

CREATE OR REPLACE FUNCTION public.stock_reference_qty(p_item_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
AS $fn$
  SELECT GREATEST(
    COALESCE(si.quantity, 0),
    COALESCE((
      SELECT sum(public.convert_qty(m.quantity, m.unit, si.unit))
        FROM public.stock_movements m
       WHERE m.item_id = si.id
         AND upper(COALESCE(m.type,'')) IN ('IN','RETURN')
         AND NOT COALESCE(m.is_reversed,false)
    ), 0)
  )
  FROM public.stock_items si WHERE si.id = p_item_id;
$fn$;

UPDATE public.stock_items si
   SET min_quantity = round(public.stock_reference_qty(si.id) * 0.10, 4),
       min_auto     = true,
       updated_at   = now()
 WHERE si.is_active
   AND NOT (COALESCE(si.min_quantity,0) > 0)
   AND public.stock_reference_qty(si.id) > 0;

CREATE OR REPLACE FUNCTION public.trg_stock_default_min()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT (COALESCE(NEW.min_quantity,0) > 0) AND COALESCE(NEW.quantity,0) > 0 THEN
    NEW.min_quantity := round(NEW.quantity * 0.10, 4);
    NEW.min_auto     := true;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_stock_default_min ON public.stock_items;
CREATE TRIGGER trg_stock_default_min
  BEFORE INSERT ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_default_min();
