-- ============================================================
-- FAZ 2 — Vardiya / çalışma saatleri + çalışma-saniyesi takvimi.
--
-- lab_shifts: bir günde birden çok pencere olabilir (vardiya + öğle = pencere arası boşluk).
-- weekday: 0=Pazar .. 6=Cumartesi (Postgres EXTRACT(DOW) ile birebir).
-- Saatler lab'in yerel saat diliminde (labs.timezone, varsayılan Europe/Istanbul).
--
-- lab_working_seconds(lab, t1, t2): [t1,t2] aralığının çalışma pencerelerine düşen
-- saniyesi. Oto-durdur (Faz 4) + net-süre analiz tek bu fonksiyonu kullanır.
-- ============================================================

-- Lab-seviye ayarlar
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Istanbul';
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS max_active_jobs_per_tech int DEFAULT 1;
UPDATE public.labs SET timezone = 'Europe/Istanbul' WHERE timezone IS NULL;
UPDATE public.labs SET max_active_jobs_per_tech = 1 WHERE max_active_jobs_per_tech IS NULL;

-- Vardiya pencereleri
CREATE TABLE IF NOT EXISTS public.lab_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      UUID NOT NULL,
  label       TEXT,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Pazar..6=Cumartesi
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  sort        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_lab_shifts_lab_weekday ON public.lab_shifts (lab_id, weekday);

ALTER TABLE public.lab_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_shifts_select ON public.lab_shifts;
CREATE POLICY lab_shifts_select ON public.lab_shifts
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE user_type IN ('lab','admin'))
  );

DROP POLICY IF EXISTS lab_shifts_write ON public.lab_shifts;
CREATE POLICY lab_shifts_write ON public.lab_shifts
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.profiles
                    WHERE user_type='admin' OR (user_type='lab' AND role IN ('manager','admin')))
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles
                    WHERE user_type='admin' OR (user_type='lab' AND role IN ('manager','admin')))
  );

-- [t1,t2] aralığının lab çalışma pencerelerine düşen saniyesi (timezone-duyarlı).
CREATE OR REPLACE FUNCTION public.lab_working_seconds(
  p_lab_id uuid, p_from timestamptz, p_to timestamptz
) RETURNS bigint
LANGUAGE plpgsql STABLE AS $function$
DECLARE
  v_tz        text;
  v_total     bigint := 0;
  v_day       date;
  v_from_loc  timestamp;
  v_to_loc    timestamp;
  r           record;
  w_start     timestamptz;
  w_end       timestamptz;
  seg_start   timestamptz;
  seg_end     timestamptz;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RETURN 0; END IF;

  SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz FROM public.labs WHERE id = p_lab_id;
  IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

  v_from_loc := p_from AT TIME ZONE v_tz;
  v_to_loc   := p_to   AT TIME ZONE v_tz;

  FOR v_day IN
    SELECT d::date FROM generate_series(
      date_trunc('day', v_from_loc), date_trunc('day', v_to_loc), interval '1 day'
    ) AS d
  LOOP
    FOR r IN
      SELECT start_time, end_time FROM public.lab_shifts
       WHERE lab_id = p_lab_id
         AND weekday = EXTRACT(DOW FROM v_day)::int
    LOOP
      w_start   := (v_day + r.start_time) AT TIME ZONE v_tz;
      w_end     := (v_day + r.end_time)   AT TIME ZONE v_tz;
      seg_start := GREATEST(w_start, p_from);
      seg_end   := LEAST(w_end, p_to);
      IF seg_end > seg_start THEN
        v_total := v_total + EXTRACT(EPOCH FROM (seg_end - seg_start))::bigint;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_total;
END;
$function$;

NOTIFY pgrst, 'reload schema';
