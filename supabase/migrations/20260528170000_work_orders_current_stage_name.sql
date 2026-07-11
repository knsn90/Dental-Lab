-- work_orders.current_stage_name — aktif aşamanın istasyon adı (denormalize)
-- Tüm panellerde "Üretimde" yerine "CAD Tasarım" gibi gerçek aşama adı gösterilsin
-- diye. Trigger ile order_stages.status değiştikçe otomatik güncellenir.

BEGIN;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS current_stage_name TEXT;

-- Trigger fonksiyonu — order_stages status değişince work_orders'ı senkronize et
CREATE OR REPLACE FUNCTION public._sync_work_order_current_stage_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_id   UUID;
  v_active_name TEXT;
BEGIN
  -- En son aktif aşamayı bul (yoksa NULL)
  SELECT os.id, ls.name
    INTO v_active_id, v_active_name
    FROM public.order_stages os
    LEFT JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.work_order_id = COALESCE(NEW.work_order_id, OLD.work_order_id)
     AND os.status = 'aktif'
   ORDER BY os.sequence_order
   LIMIT 1;

  UPDATE public.work_orders
     SET current_stage_id   = v_active_id,
         current_stage_name = v_active_name
   WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_work_order_current_stage_name ON public.order_stages;
CREATE TRIGGER sync_work_order_current_stage_name
  AFTER INSERT OR UPDATE OF status, station_id OR DELETE
  ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public._sync_work_order_current_stage_name();

-- Backfill mevcut work_orders satırları
UPDATE public.work_orders wo
   SET current_stage_name = sub.station_name
  FROM (
    SELECT DISTINCT ON (os.work_order_id)
           os.work_order_id, ls.name AS station_name
      FROM public.order_stages os
      LEFT JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.status = 'aktif'
     ORDER BY os.work_order_id, os.sequence_order
  ) sub
 WHERE wo.id = sub.work_order_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
