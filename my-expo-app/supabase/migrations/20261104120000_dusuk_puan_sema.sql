-- 20261104120000_dusuk_puan_sema
-- Değerlendirmeler ekranı ve düşük puan takibi (spec 2026-11-04 §5, §6) — şema ve yardımcılar.
--   • review_followups: iş başına tek takip satırı (puan durumu, uyarı/dönem zamanları, arama kaydı).
--     Okuma yalnız aynı lab'ın yöneticisine; yazma yalnız SECURITY DEFINER fonksiyonlarla.
--   • _review_low_min / _review_low_scores_text: etkin en düşük puan ve kısa etiketli düşük puanlar.
--   • _review_low_url: bildirim bağlantısı alıcının paneline göre.
--   • _notify_inapp_push: zil + telefon/web push; e-posta ve Twilio YOK.
-- Geri alma: rollbacks/20261104120000_dusuk_puan_sema.down.sql

-- ── Takip tablosu ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_followups (
  work_order_id     uuid PRIMARY KEY REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lab_id            uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  cur_min           smallint NULL,          -- şu anki etkin en düşük puan (null = puan yok)
  alert_min         smallint NULL,          -- son uyarının gittiği en düşük puan; düşük olmaktan çıkınca null
  first_alert_at    timestamptz NULL,
  last_alert_at     timestamptz NULL,
  period_started_at timestamptz NULL,       -- "aranmadı" döneminin başı; 48 saat buradan sayılır
  reminder_sent_at  timestamptz NULL,       -- bu dönemin hatırlatması
  called_at         timestamptz NULL,
  called_by         uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  called_min        smallint NULL,          -- aranırken geçerli olan en düşük puan
  call_note         text NULL CHECK (char_length(call_note) <= 1000),
  note_updated_at   timestamptz NULL,
  note_updated_by   uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_followups_lab_cur_min_idx ON public.review_followups (lab_id, cur_min);

ALTER TABLE public.review_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_followups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.review_followups FROM authenticated;
GRANT SELECT ON public.review_followups TO authenticated;

DROP POLICY IF EXISTS review_followups_select ON public.review_followups;
CREATE POLICY review_followups_select ON public.review_followups
  FOR SELECT TO authenticated
  USING (lab_id = public.get_my_lab_id()
         AND (coalesce(public.my_user_type(), '') = 'admin' OR public.is_lab_manager()));

-- ── Etkin en düşük puan ────────────────────────────────────────────────────
-- Değerlendirmenin genel + alt puanları ve, düşükse (1/3), WhatsApp düğme cevabı.
CREATE OR REPLACE FUNCTION public._review_low_min(p_work_order uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.order_reviews; v_wa smallint;
BEGIN
  SELECT * INTO r FROM public.order_reviews WHERE work_order_id = p_work_order;
  SELECT rr.answer INTO v_wa FROM public.review_requests rr WHERE rr.work_order_id = p_work_order;
  RETURN least(r.overall, r.fit, r.occlusion, r.contacts, r.esthetics, r.surface, r.on_time,
               CASE WHEN v_wa IN (1, 3) THEN v_wa END);
END; $function$;
REVOKE ALL ON FUNCTION public._review_low_min(uuid) FROM PUBLIC, anon, authenticated;

-- ── Kısa etiketli düşük puanlar: "Genel 3, Uyum 2" ─────────────────────────
-- Sıra: Genel, Uyum, Oklüzyon, Kontakt, Estetik, Yüzey, Zamanında teslim; WhatsApp en sonda
-- (yalnız değerlendirme WhatsApp'tan gelmediyse — aksi hâlde "Genel" zaten o cevaptır).
CREATE OR REPLACE FUNCTION public._review_low_scores_text(p_work_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.order_reviews; v_wa smallint; v_parts text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO r FROM public.order_reviews WHERE work_order_id = p_work_order;
  SELECT rr.answer INTO v_wa FROM public.review_requests rr WHERE rr.work_order_id = p_work_order;
  IF r.overall   <= 3 THEN v_parts := v_parts || ('Genel '            || r.overall);   END IF;
  IF r.fit       <= 3 THEN v_parts := v_parts || ('Uyum '             || r.fit);       END IF;
  IF r.occlusion <= 3 THEN v_parts := v_parts || ('Oklüzyon '         || r.occlusion); END IF;
  IF r.contacts  <= 3 THEN v_parts := v_parts || ('Kontakt '          || r.contacts);  END IF;
  IF r.esthetics <= 3 THEN v_parts := v_parts || ('Estetik '          || r.esthetics); END IF;
  IF r.surface   <= 3 THEN v_parts := v_parts || ('Yüzey '            || r.surface);   END IF;
  IF r.on_time   <= 3 THEN v_parts := v_parts || ('Zamanında teslim ' || r.on_time);   END IF;
  IF v_wa IN (1, 3) AND coalesce(r.source, '') <> 'whatsapp' THEN
    v_parts := v_parts || ('WhatsApp ' || v_wa);
  END IF;
  RETURN nullif(array_to_string(v_parts, ', '), '');
END; $function$;
REVOKE ALL ON FUNCTION public._review_low_scores_text(uuid) FROM PUBLIC, anon, authenticated;

-- ── Bildirim bağlantısı: alıcının paneli ───────────────────────────────────
-- Yönetim paneli kullanıcısı (admin) kendi paneline, lab yöneticisi lab paneline düşer
-- (öncül: 20261017193000 onay bildirimleri).
CREATE OR REPLACE FUNCTION public._review_low_url(p_user_type text, p_work_order uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_user_type = 'admin' THEN '/(admin)/clinics' ELSE '/(lab)/clinics' END
         || '?tab=reviews&focus=' || p_work_order::text;
$function$;
REVOKE ALL ON FUNCTION public._review_low_url(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── Zil + push (e-posta ve Twilio yok) ─────────────────────────────────────
-- _notify_channels'ın kardeşi; anahtar ve sır vault'tan okunur (trg_whatsapp_meta_notify gibi).
-- WhatsApp (Meta) notifications üzerindeki trg_whatsapp_meta_notify tetikleyicisinden gider.
CREATE OR REPLACE FUNCTION public._notify_inapp_push(p_user_id uuid, p_category text, p_title text, p_body text,
                                                     p_resource_type text, p_resource_id uuid, p_action_url text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab_id uuid; v_id uuid; v_anon text; v_secret text; v_hdr jsonb; v_fn text;
BEGIN
  SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
  VALUES (p_user_id, v_lab_id, p_category, p_title, p_body, p_resource_type, p_resource_id, p_action_url, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  BEGIN
    SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name = 'net_anon_key' LIMIT 1;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
  v_hdr := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||COALESCE(v_anon,''),
                              'apikey',COALESCE(v_anon,''),'x-notify-secret',COALESCE(v_secret,''));
  FOREACH v_fn IN ARRAY ARRAY['send-expo-push','send-web-push'] LOOP
    BEGIN
      PERFORM net.http_post(
        url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/' || v_fn,
        headers := v_hdr,
        body := jsonb_build_object('userIds', jsonb_build_array(p_user_id::text), 'category', p_category, 'notificationId', v_id::text,
          'payload', jsonb_build_object('title',p_title,'body',COALESCE(p_body,''),'actionUrl',COALESCE(p_action_url,''),
                                        'resourceType',COALESCE(p_resource_type,''),'resourceId',COALESCE(p_resource_id::text,''))));
    EXCEPTION WHEN OTHERS THEN RAISE WARNING '_notify_inapp_push % %: %', v_fn, p_user_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_id;
END; $function$;
REVOKE ALL ON FUNCTION public._notify_inapp_push(uuid, text, text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
