-- Geri alma: 20261103120000_puan_istegi_gorev
-- Canlı önceki durum: rollbacks/20261103120000_puan_istegi_gorev.before.txt
-- 20261103130000 uygulandıysa ÖNCE onun .down.sql'i çalıştırılır.
-- review_requests satırları KALIR (tablo 20261103110000'da; onun .down.sql'i düşürür).

DO $$ BEGIN PERFORM cron.unschedule('review-request-tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.fn_review_request_tick();
DROP FUNCTION IF EXISTS public._review_dispatch(uuid);
DROP FUNCTION IF EXISTS public._review_requests_claim(timestamptz);
DROP FUNCTION IF EXISTS public._review_requests_notify_app(timestamptz);
DROP FUNCTION IF EXISTS public._review_requests_housekeeping(timestamptz);
DROP FUNCTION IF EXISTS public._review_pick_phone(uuid);
DROP FUNCTION IF EXISTS public._review_work_type_label(text);
DROP FUNCTION IF EXISTS public._review_phone_tr(text);

-- notify_order_delivered: canlıdaki önceki tanım (md5 e731660a32e7a553d2b1b49977a1eead)
CREATE OR REPLACE FUNCTION public.notify_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status = 'teslim_edildi' AND COALESCE(OLD.status::text, '') <> 'teslim_edildi'
     AND NEW.doctor_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.doctor_id) THEN
    BEGIN
      PERFORM public.create_notification(
        NEW.doctor_id,
        'delivery',
        'İşinizi değerlendirin',
        COALESCE(NULLIF(NEW.patient_name, ''), NEW.order_number) || ' teslim edildi — puan verebilirsiniz',
        'work_order',
        NEW.id,
        NULL,
        '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END; $function$;

