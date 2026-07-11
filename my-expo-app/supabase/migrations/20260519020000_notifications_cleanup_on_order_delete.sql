-- ============================================================
-- Bir work_order silindiğinde, ona ait notifications da silinsin.
-- notifications.resource_id work_orders.id'ye FK değil (jenerik kaynak),
-- bu yüzden trigger ile manuel temizlik gerekiyor.
-- email_notifications zaten notifications'a CASCADE bağlı.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_notifications_for_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE resource_type = 'work_order'
    AND resource_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_cleanup_notifications ON public.work_orders;

CREATE TRIGGER trg_work_orders_cleanup_notifications
  AFTER DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_notifications_for_work_order();

COMMENT ON FUNCTION public.delete_notifications_for_work_order() IS
  'Bir iş emri silindiğinde ona ait bildirimleri (notifications + email_notifications) temizler.';
