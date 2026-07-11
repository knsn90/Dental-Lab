-- ============================================================
-- FAZ 4b — Mesai/öğle dışında aktif işleri otomatik duraklat/devam.
--
-- auto_manage_shift_pauses() (pg_cron 5 dk'da bir):
--   • Lab çalışma penceresi DIŞINDA → started 'aktif' işler 'durakladi' + auto_paused=true
--   • Çalışma penceresi İÇİNDE → auto_paused=true işler tekrar 'aktif'
-- Manuel duraklatılanlar (auto_paused=false) otomatik devam ETTİRİLMEZ.
-- Vardiya tanımlanmamış lab atlanır (24/7 duraklatmayı önler).
-- Trigger zaten segment kapama/açma + süre birikimini yapar → net süre tutarlı kalır.
-- ============================================================

ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS auto_paused boolean NOT NULL DEFAULT false;

-- Şu an lab çalışma penceresi içinde mi?
CREATE OR REPLACE FUNCTION public.is_lab_working_now(p_lab_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $function$
DECLARE
  v_tz text; v_now_local timestamp; v_wd int; v_t time;
BEGIN
  SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz FROM public.labs WHERE id = p_lab_id;
  IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;
  v_now_local := NOW() AT TIME ZONE v_tz;
  v_wd := EXTRACT(DOW FROM v_now_local)::int;
  v_t  := v_now_local::time;
  RETURN EXISTS (
    SELECT 1 FROM public.lab_shifts
     WHERE lab_id = p_lab_id AND weekday = v_wd
       AND start_time <= v_t AND end_time > v_t
  );
END;
$function$;

-- Tüm lab'lar için oto-durdur/devam
CREATE OR REPLACE FUNCTION public.auto_manage_shift_pauses()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.labs WHERE COALESCE(is_active, true) LOOP
    -- Vardiya tanımlanmamış lab → dokunma
    IF NOT EXISTS (SELECT 1 FROM public.lab_shifts WHERE lab_id = r.id) THEN
      CONTINUE;
    END IF;

    IF public.is_lab_working_now(r.id) THEN
      UPDATE public.order_stages
         SET status = 'aktif', auto_paused = false
       WHERE status = 'durakladi' AND auto_paused = true
         AND technician_id IN (SELECT id FROM public.profiles WHERE lab_id = r.id);
    ELSE
      UPDATE public.order_stages
         SET status = 'durakladi', auto_paused = true
       WHERE status = 'aktif' AND started_at IS NOT NULL
         AND technician_id IN (SELECT id FROM public.profiles WHERE lab_id = r.id);
    END IF;
  END LOOP;
END;
$function$;
