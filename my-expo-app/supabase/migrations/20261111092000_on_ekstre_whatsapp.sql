-- 20261111092000_on_ekstre_whatsapp — ön ekstre onay bağlantısı WhatsApp'tan da gider (kullanıcı kararı 2026-11-11).
--   * Meta şablonu: on_ekstre_onay (tr, UTILITY, NAMED: laboratuvar, donem, tutar, baglanti). Bağlantı gövde
--     değişkeni (hesap_acildi ile aynı onaylı kalıp; düğme/emoji yok). Meta onayına kadar gönderim Meta'da düşer
--     (whatsapp_notifications.status='failed'); onaydan sonra kod değişikliği gerekmez.
--   * _ps_wa_ready(lab_id): lab'ın etkin whatsapp-cloud hattı var mı (provider_credentials). Gizli değer okumaz.
--   * _ps_request_core: WhatsApp kolu artık R6 'unavailable/WA_TEMPLATE' DEĞİL: telefon yok → NO_CONTACT; lab hattı
--     yok → unavailable/WA_TEMPLATE; aksi halde net.http_post → send-whatsapp-meta (category='pre_statement',
--     payload.__lab_id). Ay sonu ön kontrolü (C3) WhatsApp'ı da kullanılabilir kanal sayar. EMAIL_OPTOUT yalnız
--     e-posta kolunda. Geri kalan her şey 20261110103000 ile birebir.
--   * get_statement_request_contacts: whatsapp_available = _ps_wa_ready(lab).
BEGIN;

CREATE OR REPLACE FUNCTION public._ps_wa_ready(p_lab_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM provider_credentials pc
                  WHERE pc.lab_id = p_lab_id AND pc.type = 'messaging' AND pc.provider = 'whatsapp-cloud'
                    AND pc.is_active
                    AND NULLIF(pc.credentials->>'phone_number_id', '') IS NOT NULL
                    AND NULLIF(pc.credentials->>'access_token', '') IS NOT NULL)
$function$;
REVOKE ALL ON FUNCTION public._ps_wa_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_wa_ready(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._ps_request_core(p_clinic_id uuid, p_channels text[], p_trigger text, p_period text DEFAULT NULL::text)
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
  IF p_trigger IS NULL OR p_trigger NOT IN ('manual', 'month_end') THEN
    RAISE EXCEPTION 'PS_TRIGGER' USING ERRCODE = '22023';
  END IF;
  IF (p_trigger = 'month_end' AND p_period IS NULL)
     OR (p_period IS NOT NULL AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') THEN
    RAISE EXCEPTION 'PS_PERIOD' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT c ORDER BY c) INTO v_channels FROM unnest(p_channels) c;
  IF v_channels IS NULL OR cardinality(v_channels) = 0
     OR EXISTS (SELECT 1 FROM unnest(v_channels) c WHERE c IS NULL OR c NOT IN ('email', 'whatsapp')) THEN
    RAISE EXCEPTION 'PS_CHANNELS' USING ERRCODE = '22023';
  END IF;

  -- Klinik kilidi: eşzamanlı iki istek (elle ya da ay sonu) _ps_create_link_core'un kilidinden önce sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtext('ps_link:' || p_clinic_id::text));

  IF p_trigger = 'manual' THEN
    -- Sunucu soğuma süresi (yalnız elle): aynı lab + klinik için son 10 dakikada kuyruğa alınmış elle gönderim varsa yeni
    -- bağlantı OLUŞTURULMAZ (öncekini iptal edip ikinci mesaj atmasın).
    IF EXISTS (SELECT 1 FROM statement_link_sends s
                WHERE s.lab_id = (SELECT c.lab_id FROM clinics c WHERE c.id = p_clinic_id)
                  AND s.clinic_id = p_clinic_id
                  AND s.trigger = 'manual' AND s.status = 'queued'
                  AND s.created_at > now() - interval '10 minutes') THEN
      RAISE EXCEPTION 'PS_RATE' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Ay sonu tekilliği: bu klinik + dönem için month_end satırı varsa hiçbir şey yapılmaz (yeni bağlantı da yok →
    -- ilk çalışmada gönderilen bağlantı iptal olmaz). Kısmi tekil indeks (clinic_id, period, channel) son güvencedir.
    IF EXISTS (SELECT 1 FROM statement_link_sends s
                WHERE s.clinic_id = p_clinic_id AND s.period = p_period AND s.trigger = 'month_end') THEN
      RETURN jsonb_build_object('already_sent', true);
    END IF;
    -- C2: son 72 saatte kuyruğa alınmış elle gönderim varsa atla (çift mesaj yok; taze bağlantı iptal olmaz).
    IF EXISTS (SELECT 1 FROM statement_link_sends s
                WHERE s.clinic_id = p_clinic_id AND s.trigger = 'manual' AND s.status = 'queued'
                  AND s.created_at > now() - interval '72 hours') THEN
      RETURN jsonb_build_object('recent_manual', true);
    END IF;
    -- I1 (20261110103000): son 72 saatte ELLE oluşturulmuş (created_by NOT NULL: create_statement_link /
    -- "Onay iste"; ay sonu kendi bağlantısını created_by NULL yazar) ve hâlâ etkin (iptal edilmemiş, kullanılmamış,
    -- süresi geçmemiş) bağlantı varsa atla: basılı karekod ya da yapıştırılmış bağlantı ayın 1'inde ölmesin.
    -- Bağlantı oluşmaz, mevcut bağlantı iptal olmaz, satır yazılmaz.
    IF EXISTS (SELECT 1 FROM statement_approval_links l
                WHERE l.clinic_id = p_clinic_id AND l.created_by IS NOT NULL
                  AND l.revoked_at IS NULL AND l.used_at IS NULL AND l.expires_at > now()
                  AND l.created_at > now() - interval '72 hours') THEN
      RETURN jsonb_build_object('recent_link', true);
    END IF;
    -- C3: bağlantıdan ÖNCE kullanılabilir kanal ön kontrolü (gönderim yolunun kurallarıyla aynı). Hiçbiri yoksa
    -- bağlantı oluşturulmaz, mevcut bağlantı iptal edilmez, satır yazılmaz → sonraki çalışmada yeniden denenir.
    --   alıcı: _ps_pick_recipient (= _ps_create_link_core'un R3 alıcısı)
    --   e-posta: has_email AND NOT email_optout · WhatsApp (20261111092000): has_phone AND lab'ın etkin WhatsApp hattı
    DECLARE
      v_rcp uuid := _ps_pick_recipient(p_clinic_id);
      v_rc  jsonb;
      v_ok  boolean := false;
    BEGIN
      IF v_rcp IS NOT NULL THEN
        v_rc := COALESCE(_ps_recipient_contacts(v_rcp), '{}'::jsonb);
        v_ok := ('email' = ANY (v_channels)
                 AND COALESCE((v_rc->>'has_email')::boolean, false)
                 AND NOT COALESCE((v_rc->>'email_optout')::boolean, true));
        v_ok := v_ok OR ('whatsapp' = ANY (v_channels)
                         AND COALESCE((v_rc->>'has_phone')::boolean, false)
                         AND _ps_wa_ready((SELECT c.lab_id FROM clinics c WHERE c.id = p_clinic_id)));
      END IF;
      IF NOT v_ok THEN
        RETURN jsonb_build_object('no_channel', true);
      END IF;
    END;
  END IF;

  -- Bağlantı (ayar, taslak, alıcı kuralları çekirdekte; önceki bağlantı iptal olur)
  v_link_res := _ps_create_link_core(p_clinic_id);
  v_token := v_link_res->>'token';
  SELECT * INTO v_link FROM statement_approval_links WHERE id = (v_link_res->>'link_id')::uuid;
  v_c := COALESCE(_ps_recipient_contacts(v_link.recipient_profile_id), '{}'::jsonb);
  SELECT l.name INTO v_lab_name FROM labs l WHERE l.id = v_link.lab_id;

  FOREACH v_ch IN ARRAY v_channels LOOP
    v_status := NULL; v_error := NULL;
    v_msg := _ps_request_message(v_link.id, v_ch, v_token, p_period);

    IF v_ch = 'email' AND NOT COALESCE((v_c->>'has_email')::boolean, false) THEN
      v_status := 'skipped'; v_error := 'NO_CONTACT';
    ELSIF v_ch = 'whatsapp' AND NOT COALESCE((v_c->>'has_phone')::boolean, false) THEN
      v_status := 'skipped'; v_error := 'NO_CONTACT';
    ELSIF v_ch = 'whatsapp' AND NOT _ps_wa_ready(v_link.lab_id) THEN
      -- Lab'ın etkin WhatsApp Cloud hattı yok → kanal kullanılamaz, e-posta etkilenmez
      v_status := 'unavailable'; v_error := 'WA_TEMPLATE';
    ELSIF v_ch = 'email' AND COALESCE((v_c->>'email_optout')::boolean, true) THEN
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
          IF v_ch = 'whatsapp' THEN
            -- Meta şablonu on_ekstre_onay (send-whatsapp-meta 'pre_statement'). notifications'a INSERT YOK.
            -- Edge audit satırına (whatsapp_notifications.payload) bağlantıyı karartılmış yazar.
            PERFORM net.http_post(
              url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
              headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon,
                                            'apikey', v_anon, 'x-notify-secret', v_secret),
              body := jsonb_build_object(
                'userIds', jsonb_build_array(v_link.recipient_profile_id),
                'category', 'pre_statement',
                'payload', jsonb_build_object(
                  '__lab_id', v_link.lab_id,
                  '__body', v_msg->>'title',
                  'laboratuvar', COALESCE(NULLIF(btrim(v_lab_name), ''), 'Laboratuvar'),
                  'donem', (ARRAY['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])
                             [substr(v_msg->>'period', 6, 2)::int] || ' ' || substr(v_msg->>'period', 1, 4),
                  'tutar', _ps_pending_text(v_link.id),
                  'baglanti', v_msg->>'url')));
          ELSE
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
                -- DİKKAT: email_notifications karartma tetikleyicisi TAM bu adı eşler; değiştirilmez.
                'template', 'pre_statement_link',
                'extra', jsonb_build_object('labName', v_lab_name, 'ctaLabel', 'Ekstreyi Aç'))));
          END IF;
          v_status := 'queued';
        EXCEPTION WHEN OTHERS THEN
          v_status := 'failed'; v_error := 'HTTP_ERR';
        END;
      END IF;
    END IF;

    INSERT INTO statement_link_sends (link_id, lab_id, clinic_id, period, channel, trigger, status, error, created_by)
    VALUES (v_link.id, v_link.lab_id, v_link.clinic_id, v_msg->>'period', v_ch, p_trigger, v_status, v_error, auth.uid());
    v_sends := v_sends || jsonb_build_object('channel', v_ch, 'status', v_status, 'error', v_error);
  END LOOP;

  RETURN jsonb_build_object('link_id', v_link.id, 'expires_at', v_link.expires_at,
                            'recipient_name', v_link_res->>'recipient_name', 'sends', v_sends);
END $function$
;

CREATE OR REPLACE FUNCTION public.get_statement_request_contacts(p_clinic_id uuid)
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
                                   'whatsapp_available',
                                   _ps_wa_ready((SELECT c.lab_id FROM clinics c WHERE c.id = p_clinic_id)));
END $function$;

COMMIT;
