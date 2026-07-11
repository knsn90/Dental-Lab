-- Faz 5a: İş teslim edilince hekime "değerlendir" bildirimi (doctor app kullanıcısıysa).
CREATE OR REPLACE FUNCTION public.notify_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'teslim_edildi' AND COALESCE(OLD.status, '') <> 'teslim_edildi'
     AND NEW.doctor_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.doctor_id) THEN
    BEGIN
      PERFORM public.create_notification(
        NEW.doctor_id, 'delivery', 'İşinizi değerlendirin',
        COALESCE(NULLIF(NEW.patient_name, ''), NEW.order_number) || ' teslim edildi — puan verebilirsiniz',
        'work_order', NEW.id, NULL, '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_delivered ON public.work_orders;
CREATE TRIGGER trg_notify_order_delivered
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_delivered();

-- Faz 5b: Değerlendirmeye foto (storage path dizisi — bucket: work-order-photos, prefix reviews/).
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}';
