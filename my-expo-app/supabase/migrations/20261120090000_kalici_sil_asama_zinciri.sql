-- Kalıcı sil (hard_delete_order) her zaman "yetkisiz … order_stages.DELETE" ile düşüyordu:
-- work_orders silinince aşamalar ON DELETE CASCADE ile silinir; aşama tetikleyicisi o anda
-- can_access_work_order(parent) sorar ama parent satırı artık yoktur → false → RAISE.
-- Düzeltme: yalnız zincirleme (pg_trigger_depth() > 1) aşama SİLMESİ ve parent artık YOKSA geçer.
-- Parent silmenin kendisi work_orders üzerindeki aynı korumadan (BEFORE DELETE, satır varken) geçti.
-- Doğrudan aşama silme/güncelleme ve diğer her durum eskisi gibi denetlenir.
CREATE OR REPLACE FUNCTION public.enforce_lifecycle_tenant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_wo uuid;
BEGIN
  -- Trusted server context (edge service_role / cron / postgres / anon magic-link RPC):
  -- no end-user identity → per-function token/role checks are the boundary.
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_TABLE_NAME = 'order_stages' THEN
    v_wo := COALESCE(NEW.work_order_id, OLD.work_order_id);
    -- İş emri silinirken FK zinciriyle gelen aşama silmesi: parent zaten yetkiyle silindi.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1
       AND NOT EXISTS (SELECT 1 FROM public.work_orders WHERE id = OLD.work_order_id) THEN
      RETURN OLD;
    END IF;
  ELSE  -- work_orders
    v_wo := COALESCE(NEW.id, OLD.id);
  END IF;

  -- Authenticated user must legitimately access the parent work order.
  IF v_wo IS NOT NULL AND NOT can_access_work_order(v_wo) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emrinin yaşam döngüsüne erişim yok (%.%: %)',
      TG_TABLE_NAME, TG_OP, v_wo USING errcode = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
