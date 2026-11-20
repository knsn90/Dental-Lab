-- Geri dönüş: önceki canlı tanım (zincirleme aşama silmeyi de engelliyordu).
CREATE OR REPLACE FUNCTION public.enforce_lifecycle_tenant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_wo uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'order_stages' THEN
    v_wo := COALESCE(NEW.work_order_id, OLD.work_order_id);
  ELSE
    v_wo := COALESCE(NEW.id, OLD.id);
  END IF;
  IF v_wo IS NOT NULL AND NOT can_access_work_order(v_wo) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emrinin yaşam döngüsüne erişim yok (%.%: %)',
      TG_TABLE_NAME, TG_OP, v_wo USING errcode = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
