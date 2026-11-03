-- Geri alma: 20261103110000_puan_istegi_sema
-- Canlı önceki durum: rollbacks/20261103110000_puan_istegi_sema.before.txt
-- 20261103120000 / 20261103130000 uygulandıysa ÖNCE onların .down.sql'leri çalıştırılır
-- (review_requests'e ve yeni sütunlara bağlı fonksiyonlar orada).

-- DİKKAT: eski kural (rater_id NOT NULL, UNIQUE (work_order_id, rater_id)) hesapsız hekimin
-- WhatsApp cevabını taşıyamaz. rater_id boş WhatsApp satırları silinmezse SET NOT NULL durur.
-- Bu satırlar yalnız WhatsApp düğmesinden gelir; geri almada kaybedilirler.
DELETE FROM public.order_reviews WHERE source = 'whatsapp' AND rater_id IS NULL;

DROP TABLE IF EXISTS public.review_requests;

DROP TRIGGER IF EXISTS trg_order_reviews_guard ON public.order_reviews;
DROP FUNCTION IF EXISTS public._order_reviews_guard();

DROP POLICY IF EXISTS order_reviews_update ON public.order_reviews;
CREATE POLICY order_reviews_update ON public.order_reviews
  FOR UPDATE
  USING (rater_id = auth.uid())
  WITH CHECK (rater_id = auth.uid());

DROP FUNCTION IF EXISTS public._is_order_client_party(uuid);

ALTER TABLE public.order_reviews
  ADD CONSTRAINT order_reviews_work_order_id_rater_id_key UNIQUE (work_order_id, rater_id);
ALTER TABLE public.order_reviews DROP CONSTRAINT IF EXISTS order_reviews_work_order_id_key;
ALTER TABLE public.order_reviews ALTER COLUMN rater_id SET NOT NULL;

ALTER TABLE public.order_reviews DROP CONSTRAINT IF EXISTS order_reviews_source_check;
ALTER TABLE public.order_reviews DROP COLUMN IF EXISTS rater_doctor_id;
ALTER TABLE public.order_reviews DROP COLUMN IF EXISTS source;

ALTER TABLE public.lab_settings DROP CONSTRAINT IF EXISTS lab_settings_review_wa_delay_days_check;
ALTER TABLE public.lab_settings
  DROP COLUMN IF EXISTS review_wa_delay_days,
  DROP COLUMN IF EXISTS review_wa_enabled_at,
  DROP COLUMN IF EXISTS review_wa_enabled;

ALTER TABLE public.doctors DROP COLUMN IF EXISTS review_wa_opt_out;
