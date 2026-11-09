-- 20261110101000_on_ekstre_gonderim — plan 4/5 Task 5: "Onay iste" gönderimi (DB).
--   * _ps_link_base_url() (iç): bağlantı tabanı sabiti 'https://siman.app' → URL = taban || '/s/' || jeton.
--   * statement_link_sends: gönderim kaydı (kanal başına bir satır). RLS'li; SELECT lab finans görenleri; yazma yalnız
--     SECURITY DEFINER RPC'lerle. Ay sonu tekilliği: unique (clinic_id, period, channel) WHERE trigger = 'month_end'.
--     error alanı yalnız sabit kod taşır (NO_CONTACT, EMAIL_OPTOUT, WA_TEMPLATE, NO_SECRET, HTTP_ERR); jeton hiç yazılmaz.
--   * _ps_pick_recipient(p_clinic_id) (iç): create_statement_link'in alıcı seçiminin (R3) birebir kopyası; yalnız bağlantı
--     oluşturmadan ÖNCE kanal kutularını göstermek için. Gönderimde alıcı hep bağlantının recipient_profile_id'sidir.
--     create_statement_link'e dokunulmaz; probe ikisinin aynı kişiyi seçtiğini doğrular.
--   * _ps_recipient_contacts(p_profile_id) (iç): {has_email, email_optout, has_phone}. email_optout,
--     send-email-notification'ın filtresinin aynısıdır (prefs yok / master_enabled=false / channels.email=false /
--     categories.payment.email=false → gitmez). Adres ya da numaranın kendisi dönmez.
--   * _ps_pending_text(p_link_id) (iç): bağlantının anlık görüntüsündeki, hâlâ taslak faturaların para birimi başına
--     toplamı ("₺1.234,50 + €10,00"; sabit ₺ yok).
--   * _ps_request_message(p_link_id, p_channel, p_token) (iç, önizleme): gönderici çağırmadan {title, body, url} döner.
--     Gövde yalnız lab adı, dönem, onay bekleyen toplam; url = taban/s/jeton. Hasta ya da kalem bilgisi yok.
--   * get_statement_request_contacts(p_clinic_id) (authenticated): lab + manage (değilse PS_SCOPE). Alıcının adı ve
--     yalnız boolean iletişim bilgisi + whatsapp_available=false (R6).
--   * request_pre_statement_approval(p_clinic_id, p_channels) (authenticated): kanallar ⊆ {email, whatsapp}, boş değil
--     (değilse PS_CHANNELS); create_statement_link (PS_SCOPE / PS_DISABLED / PS_EMPTY / PS_NO_RECIPIENT oradan);
--     kanal başına sıra: alıcı bilgisi yok → skipped/NO_CONTACT; WhatsApp → unavailable/WA_TEMPLATE (R6: "bağlantınız
--     hazır" için onaylı Meta şablonu yok; mevcut odeme_hatirlatma/hesap_acildi başka amaçlı); e-posta tercihi kapalı →
--     skipped/EMAIL_OPTOUT; siman.skip_notify='on' → skipped_probe (HİÇBİR ŞEY gönderilmez); aksi halde mevcut yol:
--     net.http_post → send-email-notification (Vault notify_fn_secret + net_anon_key, _send_payment_reminder_core ile
--     aynı başlıklar; category='payment'; resourceId VERİLMEZ → e-postada üçüncü taraf QR servisine jeton gitmez).
--     notifications'a INSERT YOK (trg_whatsapp_meta_notify 'payment'ı WhatsApp'a çevirirdi).
--     Dönüş {link_id, expires_at, recipient_name, sends:[{channel, status, error}]}; jeton dönmez.
--   * email_notifications BEFORE INSERT tetikleyicisi: template = 'pre_statement_link' satırında payload.actionUrl
--     '…/s/[redacted]' yapılır. Edge e-postayı istek gövdesinden çizer; audit satırına düz jeton yazılmaz.
--     Başka şablonlu satırlara dokunulmaz (WHEN koşulu). Gelecekteki göndericiler aynı şablon adını kullanmak ZORUNDA.
--   * Soğuma: aynı lab + klinik için son 10 dakikada 'queued' elle gönderim varsa PS_RATE (22023); bağlantı oluşmaz.
BEGIN;

-- === 1) Taban URL ===
CREATE FUNCTION public._ps_link_base_url()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT 'https://siman.app'::text $function$;

REVOKE ALL ON FUNCTION public._ps_link_base_url() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_link_base_url() TO service_role;

-- === 2) Gönderim kaydı ===
CREATE TABLE public.statement_link_sends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id    uuid NOT NULL REFERENCES public.statement_approval_links(id),
  lab_id     uuid NOT NULL REFERENCES public.labs(id),
  clinic_id  uuid NOT NULL,
  period     text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  channel    text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  trigger    text NOT NULL CHECK (trigger IN ('manual', 'month_end')),
  status     text NOT NULL CHECK (status IN ('queued', 'skipped', 'skipped_probe', 'unavailable', 'failed')),
  error      text CHECK (error IS NULL OR error IN ('NO_CONTACT', 'EMAIL_OPTOUT', 'WA_TEMPLATE', 'NO_SECRET', 'HTTP_ERR')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX statement_link_sends_clinic_idx ON public.statement_link_sends (clinic_id, created_at DESC);
CREATE INDEX statement_link_sends_lab_idx ON public.statement_link_sends (lab_id, created_at DESC);
CREATE INDEX statement_link_sends_link_idx ON public.statement_link_sends (link_id);
CREATE UNIQUE INDEX statement_link_sends_month_end_once ON public.statement_link_sends (clinic_id, period, channel)
  WHERE trigger = 'month_end';

ALTER TABLE public.statement_link_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_link_sends_select ON public.statement_link_sends
  FOR SELECT TO authenticated
  USING (lab_id = get_my_lab_id() AND lab_can_view_finance());
REVOKE ALL ON TABLE public.statement_link_sends FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.statement_link_sends TO authenticated;
GRANT ALL ON TABLE public.statement_link_sends TO service_role;

-- === 3) Alıcı seçimi (iç): create_statement_link'in R3 sorgusunun birebir kopyası ===
CREATE FUNCTION public._ps_pick_recipient(p_clinic_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id
    FROM profiles p
   WHERE p.user_type IN ('clinic_admin', 'doctor')
     AND (p.clinic_id = p_clinic_id
          OR p.id IN (SELECT m.member_profile_id FROM clinic_lab_memberships m
                       WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id AND m.member_profile_id IS NOT NULL)
          OR p.clinic_id IN (SELECT m.member_clinic_id FROM clinic_lab_memberships m
                              WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id AND m.member_clinic_id IS NOT NULL)
          OR (p.clinic_id IS NULL AND p.doctor_id IN (SELECT d.id FROM doctors d WHERE d.clinic_id = p_clinic_id)))
     AND _ps_profile_is_approver(p.id, p_clinic_id)
   ORDER BY (p.user_type <> 'clinic_admin'), p.created_at, p.id
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public._ps_pick_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_pick_recipient(uuid) TO service_role;

-- === 4) Alıcı iletişim durumu (iç; yalnız boolean) ===
CREATE FUNCTION public._ps_recipient_contacts(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'has_email', NULLIF(btrim(p.email), '') IS NOT NULL,
           -- send-email-notification filtresinin aynısı (category = 'payment')
           -- (eksik anahtar NULL karşılaştırma verir → COALESCE ile "kapalı değil")
           'email_optout', COALESCE(p.notification_prefs IS NULL
                            OR jsonb_typeof(p.notification_prefs) <> 'object'
                            OR p.notification_prefs->'master_enabled' = 'false'::jsonb
                            OR p.notification_prefs #> '{channels,email}' = 'false'::jsonb
                            OR p.notification_prefs #> '{categories,payment,email}' = 'false'::jsonb, false),
           'has_phone', COALESCE(NULLIF(btrim(p.whatsapp_phone), ''), NULLIF(btrim(p.phone), '')) IS NOT NULL)
    FROM profiles p WHERE p.id = p_profile_id
$function$;

REVOKE ALL ON FUNCTION public._ps_recipient_contacts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_recipient_contacts(uuid) TO service_role;

-- === 5) Onay bekleyen toplam metni (iç) ===
CREATE FUNCTION public._ps_pending_text(p_link_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM statement_approval_links WHERE id = p_link_id),
  amt AS (
    SELECT COALESCE(NULLIF(upper(btrim(i.currency)), ''), 'TRY') AS ccy, sum(COALESCE(i.total, 0)) AS total
      FROM l
      JOIN invoices i ON i.id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(l.snapshot) e)
     WHERE i.clinic_id = l.clinic_id AND i.lab_id = l.lab_id AND i.status = 'taslak'
     GROUP BY 1
  )
  SELECT COALESCE(string_agg(
           CASE a.ccy WHEN 'EUR' THEN '€' WHEN 'TRY' THEN '₺' WHEN 'USD' THEN '$' WHEN 'GBP' THEN '£' ELSE a.ccy || ' ' END
           || translate(to_char(a.total, 'FM999G999G990D00'), ',.', '.,'),
           ' + ' ORDER BY a.total DESC), '—')
    FROM amt a
$function$;

REVOKE ALL ON FUNCTION public._ps_pending_text(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_pending_text(uuid) TO service_role;

-- === 6) Mesaj önizleme (iç; gönderici çağırmaz) ===
CREATE FUNCTION public._ps_request_message(p_link_id uuid, p_channel text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link   statement_approval_links;
  v_lab    text;
  v_today  date;
  v_period text;
  v_total  text;
  v_months text[] := ARRAY['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email', 'whatsapp') THEN
    RAISE EXCEPTION 'PS_CHANNELS' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_link FROM statement_approval_links WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(NULLIF(btrim(l.name), ''), 'Laboratuvar') INTO v_lab FROM labs l WHERE l.id = v_link.lab_id;
  v_today  := lab_today(v_link.lab_id);
  v_period := v_months[extract(month FROM v_today)::int] || ' ' || extract(year FROM v_today)::int;
  v_total  := _ps_pending_text(p_link_id);
  RETURN jsonb_build_object(
    'title', v_lab || ' · Ön ekstre onayınızı bekliyor',
    'body',  v_lab || ' laboratuvarının ' || v_period || ' dönemi ön ekstresi onayınızı bekliyor. '
             || 'Onay bekleyen toplam: ' || v_total || '. '
             || 'Ekstreyi incelemek, PDF''ini indirmek ve onaylamak için bağlantıyı açın.',
    'url',   _ps_link_base_url() || '/s/' || COALESCE(p_token, ''),
    'period', to_char(v_today, 'YYYY-MM'));
END $function$;

REVOKE ALL ON FUNCTION public._ps_request_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_request_message(uuid, text, text) TO service_role;

-- === 7) Kanal kutuları için alıcı durumu (lab) ===
CREATE FUNCTION public.get_statement_request_contacts(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rcp uuid;
  v_c   jsonb;
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  v_rcp := _ps_pick_recipient(p_clinic_id);
  IF v_rcp IS NULL THEN
    RETURN jsonb_build_object('has_recipient', false, 'recipient_name', NULL, 'has_email', false,
                              'email_optout', false, 'has_phone', false, 'whatsapp_available', false);
  END IF;
  v_c := _ps_recipient_contacts(v_rcp);
  RETURN v_c || jsonb_build_object('has_recipient', true,
                                   'recipient_name', (SELECT p.full_name FROM profiles p WHERE p.id = v_rcp),
                                   'whatsapp_available', false);
END $function$;

REVOKE ALL ON FUNCTION public.get_statement_request_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_statement_request_contacts(uuid) TO authenticated, service_role;

-- === 8) Onay iste (lab) ===
CREATE FUNCTION public.request_pre_statement_approval(p_clinic_id uuid, p_channels text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_channels text[];
  v_link_res jsonb;
  v_link     statement_approval_links;
  v_token    text;
  v_c        jsonb;
  v_msg      jsonb;
  v_ch       text;
  v_status   text;
  v_error    text;
  v_secret   text;
  v_anon     text;
  v_lab_name text;
  v_probe    boolean := COALESCE(current_setting('siman.skip_notify', true), '') = 'on';
  v_sends    jsonb := '[]'::jsonb;
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT c ORDER BY c) INTO v_channels FROM unnest(p_channels) c;
  IF v_channels IS NULL OR cardinality(v_channels) = 0
     OR EXISTS (SELECT 1 FROM unnest(v_channels) c WHERE c IS NULL OR c NOT IN ('email', 'whatsapp')) THEN
    RAISE EXCEPTION 'PS_CHANNELS' USING ERRCODE = '22023';
  END IF;

  -- Sunucu soğuma süresi: aynı lab + klinik için son 10 dakikada kuyruğa alınmış elle gönderim varsa yeni bağlantı
  -- OLUŞTURULMAZ (öncekini iptal edip ikinci mesaj atmasın). Lab kliniğin lab'ıdır (_ps_actor = 'lab' doğruladı).
  -- Eşzamanlı iki isteği create_statement_link'in klinik kilidinden önce sıraya sokmak için aynı kilit burada alınır.
  PERFORM pg_advisory_xact_lock(hashtext('ps_link:' || p_clinic_id::text));
  IF EXISTS (SELECT 1 FROM statement_link_sends s
              WHERE s.lab_id = (SELECT c.lab_id FROM clinics c WHERE c.id = p_clinic_id)
                AND s.clinic_id = p_clinic_id
                AND s.trigger = 'manual' AND s.status = 'queued'
                AND s.created_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'PS_RATE' USING ERRCODE = '22023';
  END IF;

  -- Bağlantı (yetki, ayar, taslak, alıcı kuralları create_statement_link'te; önceki bağlantı iptal olur)
  v_link_res := create_statement_link(p_clinic_id);
  v_token := v_link_res->>'token';
  SELECT * INTO v_link FROM statement_approval_links WHERE id = (v_link_res->>'link_id')::uuid;
  v_c := COALESCE(_ps_recipient_contacts(v_link.recipient_profile_id), '{}'::jsonb);
  SELECT l.name INTO v_lab_name FROM labs l WHERE l.id = v_link.lab_id;

  FOREACH v_ch IN ARRAY v_channels LOOP
    v_status := NULL; v_error := NULL;
    v_msg := _ps_request_message(v_link.id, v_ch, v_token);

    IF v_ch = 'email' AND NOT COALESCE((v_c->>'has_email')::boolean, false) THEN
      v_status := 'skipped'; v_error := 'NO_CONTACT';
    ELSIF v_ch = 'whatsapp' AND NOT COALESCE((v_c->>'has_phone')::boolean, false) THEN
      v_status := 'skipped'; v_error := 'NO_CONTACT';
    ELSIF v_ch = 'whatsapp' THEN
      -- R6: "bağlantınız hazır" için onaylı Meta şablonu yok → kanal kapalı, e-posta etkilenmez
      v_status := 'unavailable'; v_error := 'WA_TEMPLATE';
    ELSIF COALESCE((v_c->>'email_optout')::boolean, true) THEN
      v_status := 'skipped'; v_error := 'EMAIL_OPTOUT';
    ELSIF v_probe THEN
      v_status := 'skipped_probe';
    ELSE
      BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
      BEGIN SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name = 'net_anon_key' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;
      IF v_anon IS NULL OR v_secret IS NULL THEN
        v_status := 'failed'; v_error := 'NO_SECRET';
      ELSE
        BEGIN
          PERFORM net.http_post(
            url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon,
                                          'apikey', v_anon, 'x-notify-secret', v_secret),
            body := jsonb_build_object(
              'userIds', jsonb_build_array(v_link.recipient_profile_id),
              'category', 'payment',
              'payload', jsonb_build_object(
                'title', v_msg->>'title',
                'body', v_msg->>'body',
                'actionUrl', v_msg->>'url',
                'template', 'pre_statement_link',
                'extra', jsonb_build_object('labName', v_lab_name, 'ctaLabel', 'Ekstreyi Aç'))));
          v_status := 'queued';
        EXCEPTION WHEN OTHERS THEN
          v_status := 'failed'; v_error := 'HTTP_ERR';
        END;
      END IF;
    END IF;

    INSERT INTO statement_link_sends (link_id, lab_id, clinic_id, period, channel, trigger, status, error, created_by)
    VALUES (v_link.id, v_link.lab_id, v_link.clinic_id, v_msg->>'period', v_ch, 'manual', v_status, v_error, auth.uid());
    v_sends := v_sends || jsonb_build_object('channel', v_ch, 'status', v_status, 'error', v_error);
  END LOOP;

  RETURN jsonb_build_object('link_id', v_link.id, 'expires_at', v_link.expires_at,
                            'recipient_name', v_link_res->>'recipient_name', 'sends', v_sends);
END $function$;

REVOKE ALL ON FUNCTION public.request_pre_statement_approval(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pre_statement_approval(uuid, text[]) TO authenticated, service_role;

-- === 9) E-posta audit satırında jeton saklanmaz ===
CREATE FUNCTION public._email_notifications_redact_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.template = 'pre_statement_link' AND NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object' THEN
    NEW.payload := jsonb_set(NEW.payload, '{actionUrl}', to_jsonb(_ps_link_base_url() || '/s/[redacted]'), true);
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._email_notifications_redact_link() FROM PUBLIC, anon, authenticated;

-- DİKKAT: Onay bağlantısı (jetonlu URL) taşıyan HER gelecekteki gönderici (ör. ay sonu işi) payload.template'i
-- TAM OLARAK 'pre_statement_link' yazmalıdır; aksi halde audit satırında jeton düz metin kalır.
CREATE TRIGGER trg_email_notifications_redact_link
  BEFORE INSERT ON public.email_notifications
  FOR EACH ROW WHEN (NEW.template = 'pre_statement_link')
  EXECUTE FUNCTION public._email_notifications_redact_link();

COMMIT;
