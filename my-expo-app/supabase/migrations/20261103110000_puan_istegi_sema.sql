-- 20261103110000_puan_istegi_sema
-- WhatsApp'tan puan isteği (spec: docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md) — şema.
--   • order_reviews: WhatsApp kaydını taşıyabilsin (source, rater_doctor_id, rater_id boş olabilir)
--     ve iş başına TEK değerlendirme olsun (UNIQUE work_order_id; canlıda 6 satır 6 ayrı işte).
--   • İşin hekim/klinik tarafı aynı satırı uygulamadan tamamlayabilsin (güncelleme politikası),
--     ama kimlik/kaynak/lab yanıtı sütunlarına dokunamasın (guard tetikleyicisi).
--   • review_requests: her teslimin puan isteği satırı. İstemci yazamaz; lab yöneticisi okur.
--   • lab_settings: özellik anahtarı + gün sayısı; doctors: hekim bazında kapatma.
-- Davranış değişmez: bu göç hiçbir bildirim/gönderim yolu eklemez (o iş 20261103120000'da).
-- Geri alma: rollbacks/20261103110000_puan_istegi_sema.down.sql

-- ── order_reviews: sütunlar ────────────────────────────────────────────────
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS rater_doctor_id uuid NULL REFERENCES public.doctors(id) ON DELETE SET NULL;

ALTER TABLE public.order_reviews
  ADD CONSTRAINT order_reviews_source_check CHECK (source IN ('app', 'whatsapp'));

-- Hesapsız hekimin WhatsApp cevabında değerlendiren profil yoktur.
ALTER TABLE public.order_reviews ALTER COLUMN rater_id DROP NOT NULL;

COMMENT ON COLUMN public.order_reviews.source IS
  'app = uygulamadan; whatsapp = WhatsApp puan isteğinin düğmesinden (overall dışı boyutlar boş)';
COMMENT ON COLUMN public.order_reviews.rater_doctor_id IS
  'WhatsApp cevabında isteğin hekimi (doctors.id); hesabı yoksa rater_id boş kalır';

-- ── order_reviews: iş başına tek değerlendirme ─────────────────────────────
ALTER TABLE public.order_reviews
  ADD CONSTRAINT order_reviews_work_order_id_key UNIQUE (work_order_id);
ALTER TABLE public.order_reviews
  DROP CONSTRAINT order_reviews_work_order_id_rater_id_key;

-- ── İşin hekim/klinik tarafı mı? (politikada kullanılır) ───────────────────
-- _order_client_recipients authenticated'a açık değil; yalnız evet/hayır döndüren sarmalayıcı.
CREATE OR REPLACE FUNCTION public._is_order_client_party(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public._order_client_recipients(p_order) r WHERE r = auth.uid());
$function$;
REVOKE ALL ON FUNCTION public._is_order_client_party(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_order_client_party(uuid) TO authenticated;

-- ── Güncelleme: değerlendiren ya da işin hekim/klinik tarafı ───────────────
DROP POLICY IF EXISTS order_reviews_update ON public.order_reviews;
CREATE POLICY order_reviews_update ON public.order_reviews
  FOR UPDATE
  USING (rater_id = auth.uid() OR public._is_order_client_party(work_order_id))
  WITH CHECK (rater_id = auth.uid() OR public._is_order_client_party(work_order_id));

-- ── Guard: istemci kimlik, kaynak ve lab yanıtı sütunlarını değiştiremez ────
-- Lab personeli (kendi lab'ının satırında) ve servis rolü (auth.uid() boş) muaf.
CREATE OR REPLACE FUNCTION public._order_reviews_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (coalesce(public.my_user_type(), '') IN ('lab', 'admin')
              AND OLD.lab_id IS NOT DISTINCT FROM public.get_my_lab_id()) THEN
    NEW.work_order_id   := OLD.work_order_id;
    NEW.lab_id          := OLD.lab_id;
    NEW.rater_id        := OLD.rater_id;
    NEW.rater_doctor_id := OLD.rater_doctor_id;
    NEW.source          := OLD.source;
    NEW.lab_reply       := OLD.lab_reply;
    NEW.lab_reply_at    := OLD.lab_reply_at;
    NEW.lab_reply_by    := OLD.lab_reply_by;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._order_reviews_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_reviews_guard ON public.order_reviews;
CREATE TRIGGER trg_order_reviews_guard
  BEFORE UPDATE ON public.order_reviews
  FOR EACH ROW EXECUTE FUNCTION public._order_reviews_guard();

-- ── review_requests: her teslimin puan isteği ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lab_id          uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  doctor_id       uuid NULL REFERENCES public.doctors(id) ON DELETE SET NULL,
  delivered_at    timestamptz NOT NULL,
  due_on          date NOT NULL,
  phone_to        text NULL,
  phone_source    text NULL CHECK (phone_source IN ('doctor_account', 'doctor', 'clinic_whatsapp', 'clinic_phone')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sending', 'sent', 'answered', 'failed', 'expired', 'skipped')),
  skip_reason     text NULL,
  claimed_at      timestamptz NULL,
  sent_at         timestamptz NULL,
  wamid           text NULL,
  error           text NULL,
  answer          smallint NULL CHECK (answer IN (1, 3, 5)),
  answered_at     timestamptz NULL,
  note_until      timestamptz NULL,
  app_notified_at timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.review_requests IS
  'Teslim edilen her işin puan isteği (uygulama içi + WhatsApp). Yalnız sunucu fonksiyonları yazar.';
COMMENT ON COLUMN public.review_requests.skip_reason IS
  'wa_off | before_enabled | opted_out | no_phone | no_wa_cred | reviewed | not_delivered | stale';

CREATE INDEX IF NOT EXISTS review_requests_status_due_idx ON public.review_requests (status, due_on);
CREATE INDEX IF NOT EXISTS review_requests_phone_sent_idx ON public.review_requests (phone_to, sent_at);
CREATE INDEX IF NOT EXISTS review_requests_lab_created_idx ON public.review_requests (lab_id, created_at DESC);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.review_requests FROM authenticated;
GRANT SELECT ON public.review_requests TO authenticated;

DROP POLICY IF EXISTS review_requests_select ON public.review_requests;
CREATE POLICY review_requests_select ON public.review_requests
  FOR SELECT TO authenticated
  USING (lab_id = public.get_my_lab_id()
         AND (public.my_user_type() = 'admin' OR public.is_lab_manager()));

-- ── Ayarlar ────────────────────────────────────────────────────────────────
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS review_wa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_wa_enabled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS review_wa_delay_days integer NOT NULL DEFAULT 3;
ALTER TABLE public.lab_settings
  ADD CONSTRAINT lab_settings_review_wa_delay_days_check CHECK (review_wa_delay_days BETWEEN 1 AND 14);

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS review_wa_opt_out boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.doctors.review_wa_opt_out IS
  'true = bu hekime WhatsApp puan isteği gönderilmez (uygulama içi istek etkilenmez)';
