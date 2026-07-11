-- ============================================================
-- İstasyon bazlı teknisyen yetkisi — tek kanonik yetkinlik modeli.
--
-- Neden: 7-aşama (user_stage_skills) modeli Türkçe istasyon adlarına uymuyor
-- (_stage_for_station çoğu istasyonu 'TRIAGE'a düşürüyor). profiles.skills +
-- lab_stations.required_skills ise boş/serbest-metin, gerçek gating yok.
-- Bu tablo teknisyeni DOĞRUDAN gerçek lab_stations satırına bağlar (station_id),
-- ad parse'ı yok, 17 istasyona birebir.
--
-- Okuyanlar: Yeniden Ata, kuyruk, triyaj oto-atama → order_stages.station_id ile
-- bu tabloyu kontrol eder. Editör: İş Akışları → Personel.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_station_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  station_id  UUID NOT NULL REFERENCES public.lab_stations(id) ON DELETE CASCADE,
  lab_id      UUID,  -- multi-tenancy (FK yok — user_stage_skills ile aynı karar)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_user_station_skills_station ON public.user_station_skills (station_id);
CREATE INDEX IF NOT EXISTS idx_user_station_skills_user    ON public.user_station_skills (user_id);

ALTER TABLE public.user_station_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_station_skills_select ON public.user_station_skills;
CREATE POLICY user_station_skills_select ON public.user_station_skills
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE user_type IN ('lab','admin'))
  );

DROP POLICY IF EXISTS user_station_skills_write ON public.user_station_skills;
CREATE POLICY user_station_skills_write ON public.user_station_skills
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.profiles
                    WHERE user_type='admin' OR (user_type='lab' AND role IN ('manager','admin')))
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles
                    WHERE user_type='admin' OR (user_type='lab' AND role IN ('manager','admin')))
  );

NOTIFY pgrst, 'reload schema';
