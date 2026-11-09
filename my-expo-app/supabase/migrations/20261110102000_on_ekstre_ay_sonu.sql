-- 20261110102000_on_ekstre_ay_sonu — plan 4/5 Task 6: ay sonu otomatik onay isteği (DB + pg_cron).
--   * _ps_create_link_core(p_clinic_id) (iç): create_statement_link'in gövdesi, yetki kontrolü HARİÇ (PS_DISABLED,
--     klinik kilidi, anlık görüntü / PS_EMPTY, R3 alıcı / PS_NO_RECIPIENT, eski bağlantıları iptal, jeton). Oturumsuz
--     (cron) yolda created_by = auth.uid() = NULL. create_statement_link aynı imza, aynı dönüş, aynı hata sırasıyla
--     buna sarılır: önce _ps_actor = 'lab' + _ps_can_manage (PS_SCOPE).
--   * _ps_request_message(p_link_id, p_channel, p_token, p_period DEFAULT NULL) (iç): dönem artık parametre.
--     NULL → bugünkü ay (elle "Onay iste"nin davranışı aynen); 'YYYY-MM' → o ay (ay sonu: biten ay). 3 parametreli
--     eski imza düşürülür; 3 argümanlı çağrılar varsayılanla aynı sonucu verir.
--   * _ps_request_core(p_clinic_id, p_channels, p_trigger, p_period DEFAULT NULL) (iç): Task 5 request_pre_statement_approval
--     gövdesi, yetki kontrolü HARİÇ. Kanal doğrulama (PS_CHANNELS) → klinik kilidi → yalnız trigger='manual' için
--     10 dk soğuma (PS_RATE) → yalnız trigger='month_end' için sırayla: bu klinik + dönemde month_end satırı varsa
--     {already_sent:true}; son 72 saatte 'queued' elle gönderim varsa {recent_manual:true} (C2); bağlantıdan ÖNCE
--     kullanılabilir kanal ön kontrolü — onaylayıcı alıcı + e-posta var + tercih kapalı değil (WhatsApp R6 gereği hep
--     kullanılamaz) — yoksa {no_channel:true} (C3). Üçünde de bağlantı oluşmaz, mevcut bağlantı iptal olmaz, satır
--     yazılmaz → bağlantı → kanal başına aynı karar sırası → statement_link_sends satırı
--     (trigger = p_trigger, period = mesajın dönemi). E-posta şablonu her iki yolda da TAM OLARAK 'pre_statement_link'
--     (email_notifications karartma tetikleyicisi bu adı eşler).
--   * request_pre_statement_approval(p_clinic_id, p_channels): aynı imza ve ACL; PS_SCOPE kontrolü + _ps_request_core(…, 'manual').
--     Dönüş biçimi, hatalar ve PS_RATE aynen.
--   * run_month_end_pre_statements(p_period DEFAULT NULL) (yalnız postgres / cron): invoice_approval_enabled açık ve
--     etkin her lab; lab'ın etkin, taslağı olan her kliniği için _ps_request_core(klinik, {email, whatsapp},
--     'month_end', dönem). Dönem: p_period ya da lab'ın yerel gününe (lab_today) göre biten ay. Klinik başına alt
--     transaction: hata yakalanır, sayılır, döngü sürer.
--     Sayımlar (klinik başına tek sonuç):
--       sent    — en az bir kanal kuyruğa alındı ('queued'; probe'da 'skipped_probe').
--       skipped — bu klinik + dönem için month_end satırı zaten var (idempotent) ya da son 72 saatte elle gönderim var.
--       failed  — 'no_channel' (ön kontrol: kullanılabilir kanal yok; hiçbir şey yazılmaz, sonraki çalışmada yeniden
--                 denenir) · işlenirken hata (PS_* kodu ya da ERROR; alt transaction geri alınır, yeniden denenir) ·
--                 'send_failed' (ön kontrolden geçti ama NO_SECRET / HTTP_ERR; satır yazıldığı için yeniden denenmez).
--     Dönüş {labs, clinics, sent, skipped, failed, failed_reasons:{kod: sayı}, periods:[…]}; ad, tutar, iletişim yok.
--   * Cron 'pre-statement-month-end' '30 6 1 * *' (GMT) = her ayın 1'i 09:30 TR; 'monthly-invoice-sweep' 06:00 GMT'den
--     30 dk sonra (süpürge taslak üretir, bu iş onları gönderir).
--   * Hiçbir fatura kesinleştirilmez (§2.6): yalnız bağlantı + gönderim kaydı.
BEGIN;

-- === 1) Bağlantı çekirdeği (iç) ===
CREATE FUNCTION public._ps_create_link_core(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     uuid;
  v_snap    jsonb;
  v_rcp     uuid;
  v_rname   text;
  v_token   text;
  v_id      uuid;
  v_exp     timestamptz := now() + interval '45 days';
BEGIN
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = p_clinic_id;
  IF NOT COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s WHERE s.lab_id = v_lab), false) THEN
    RAISE EXCEPTION 'PS_DISABLED' USING ERRCODE = '22023';
  END IF;

  -- Aynı kliniğe eşzamanlı iki bağlantı sıraya girer (tek etkin bağlantı)
  PERFORM pg_advisory_xact_lock(hashtext('ps_link:' || p_clinic_id::text));

  -- Anlık görüntü: bu kliniğin, bu lab'daki taslakları; updated_at ISO metin (to_jsonb) → _ps_finalize K6 karşılaştırması
  SELECT jsonb_agg(jsonb_build_object('id', i.id, 'updated_at', to_jsonb(i.updated_at)) ORDER BY i.created_at, i.id)
    INTO v_snap
    FROM invoices i
   WHERE i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak';
  IF v_snap IS NULL OR jsonb_array_length(v_snap) = 0 THEN
    RAISE EXCEPTION 'PS_EMPTY' USING ERRCODE = '22023';
  END IF;

  -- R3: alıcı = panelin onaylayıcı kuralının (_ps_actor = 'approver') kabul ettiği kişi; önce clinic_admin, sonra hekim,
  -- her grupta en eski. Aday kümesi _ps_actor'ın klinik kümesiyle aynı; son karar _ps_profile_is_approver'da.
  SELECT p.id, p.full_name INTO v_rcp, v_rname
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
   LIMIT 1;
  IF v_rcp IS NULL THEN
    RAISE EXCEPTION 'PS_NO_RECIPIENT' USING ERRCODE = '22023';
  END IF;

  -- R2: yeni bağlantı, aynı kliniğin iptal edilmemiş ve kullanılmamış bağlantılarını iptal eder
  UPDATE statement_approval_links
     SET revoked_at = now()
   WHERE clinic_id = p_clinic_id AND revoked_at IS NULL AND used_at IS NULL;

  -- Jeton: 32 rastgele bayt → base64url (dolgusuz, 43 karakter). Saklanan yalnız sha256 hex karması.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  INSERT INTO statement_approval_links (lab_id, clinic_id, token_hash, recipient_profile_id, snapshot, created_by, expires_at)
  VALUES (v_lab, p_clinic_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_rcp, v_snap, auth.uid(), v_exp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('token', v_token, 'link_id', v_id, 'expires_at', v_exp, 'recipient_name', v_rname);
END $function$;

REVOKE ALL ON FUNCTION public._ps_create_link_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_create_link_core(uuid) TO service_role;

-- === 2) Bağlantı oluştur (lab): aynı imza, yetki + çekirdek ===
CREATE OR REPLACE FUNCTION public.create_statement_link(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  RETURN _ps_create_link_core(p_clinic_id);
END $function$;

-- === 3) Mesaj önizleme: dönem parametresi ===
DROP FUNCTION public._ps_request_message(uuid, text, text);
CREATE FUNCTION public._ps_request_message(p_link_id uuid, p_channel text, p_token text, p_period text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link   statement_approval_links;
  v_lab    text;
  v_ym     text;
  v_period text;
  v_total  text;
  v_months text[] := ARRAY['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email', 'whatsapp') THEN
    RAISE EXCEPTION 'PS_CHANNELS' USING ERRCODE = '22023';
  END IF;
  IF p_period IS NOT NULL AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'PS_PERIOD' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_link FROM statement_approval_links WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(NULLIF(btrim(l.name), ''), 'Laboratuvar') INTO v_lab FROM labs l WHERE l.id = v_link.lab_id;
  -- NULL → bugünkü ay (elle gönderim, Task 5 davranışı); aksi halde verilen dönem (ay sonu: biten ay)
  v_ym     := COALESCE(p_period, to_char(lab_today(v_link.lab_id), 'YYYY-MM'));
  v_period := v_months[substr(v_ym, 6, 2)::int] || ' ' || substr(v_ym, 1, 4)::int;
  v_total  := _ps_pending_text(p_link_id);
  RETURN jsonb_build_object(
    'title', v_lab || ' · Ön ekstre onayınızı bekliyor',
    'body',  v_lab || ' laboratuvarının ' || v_period || ' dönemi ön ekstresi onayınızı bekliyor. '
             || 'Onay bekleyen toplam: ' || v_total || '. '
             || 'Ekstreyi incelemek, PDF''ini indirmek ve onaylamak için bağlantıyı açın.',
    'url',   _ps_link_base_url() || '/s/' || COALESCE(p_token, ''),
    'period', v_ym);
END $function$;

REVOKE ALL ON FUNCTION public._ps_request_message(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_request_message(uuid, text, text, text) TO service_role;

-- === 4) Gönderim çekirdeği (iç; yetki kontrolü çağıranda) ===
CREATE FUNCTION public._ps_request_core(p_clinic_id uuid, p_channels text[], p_trigger text, p_period text DEFAULT NULL)
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
    -- C3: bağlantıdan ÖNCE kullanılabilir kanal ön kontrolü (gönderim yolunun kurallarıyla aynı). Hiçbiri yoksa
    -- bağlantı oluşturulmaz, mevcut bağlantı iptal edilmez, satır yazılmaz → sonraki çalışmada yeniden denenir.
    --   alıcı: _ps_pick_recipient (= _ps_create_link_core'un R3 alıcısı)
    --   e-posta: has_email AND NOT email_optout · WhatsApp: R6 gereği şimdilik hep kullanılamaz (WA_TEMPLATE)
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
        -- ('whatsapp' = ANY (v_channels) AND has_phone AND <onaylı şablon>) — şablon yok, bu yüzden false
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
                -- DİKKAT: email_notifications karartma tetikleyicisi TAM bu adı eşler; değiştirilmez.
                'template', 'pre_statement_link',
                'extra', jsonb_build_object('labName', v_lab_name, 'ctaLabel', 'Ekstreyi Aç'))));
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
END $function$;

REVOKE ALL ON FUNCTION public._ps_request_core(uuid, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_request_core(uuid, text[], text, text) TO service_role;

-- === 5) Onay iste (lab): aynı imza, yetki + çekirdek ('manual') ===
CREATE OR REPLACE FUNCTION public.request_pre_statement_approval(p_clinic_id uuid, p_channels text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  RETURN _ps_request_core(p_clinic_id, p_channels, 'manual', NULL);
END $function$;

-- === 6) Ay sonu işi (yalnız postgres / cron) ===
CREATE FUNCTION public.run_month_end_pre_statements(p_period text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     record;
  v_clinic  record;
  v_period  text;
  v_res     jsonb;
  v_code    text;
  v_labs    int := 0;
  v_clinics int := 0;
  v_sent    int := 0;
  v_skipped int := 0;
  v_failed  int := 0;
  v_reasons jsonb := '{}'::jsonb;
  v_periods text[] := '{}';
BEGIN
  -- Savunma: yalnız oturumsuz (cron / postgres) çağrı. ACL zaten authenticated/anon/service_role'e kapalı.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NOT NULL AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'PS_PERIOD' USING ERRCODE = '22023';
  END IF;

  FOR v_lab IN
    SELECT l.id
      FROM labs l
      JOIN lab_settings s ON s.lab_id = l.id
     WHERE s.invoice_approval_enabled = true
       AND COALESCE(l.is_active, true)
     ORDER BY l.id
  LOOP
    v_labs := v_labs + 1;
    -- Biten ay: lab'ın yerel gününün ayından bir önceki ay (1'inde çalışınca az önce biten ay)
    v_period := COALESCE(p_period, to_char(date_trunc('month', lab_today(v_lab.id)) - interval '1 day', 'YYYY-MM'));
    IF NOT v_period = ANY (v_periods) THEN v_periods := v_periods || v_period; END IF;

    FOR v_clinic IN
      SELECT c.id
        FROM clinics c
       WHERE c.lab_id = v_lab.id
         AND c.is_active = true
         AND EXISTS (SELECT 1 FROM invoices i
                      WHERE i.clinic_id = c.id AND i.lab_id = v_lab.id AND i.status = 'taslak')
       ORDER BY c.id
    LOOP
      v_clinics := v_clinics + 1;
      BEGIN
        v_res := _ps_request_core(v_clinic.id, ARRAY['email', 'whatsapp'], 'month_end', v_period);
        IF COALESCE((v_res->>'already_sent')::boolean, false)
           OR COALESCE((v_res->>'recent_manual')::boolean, false) THEN
          v_skipped := v_skipped + 1;
        ELSIF COALESCE((v_res->>'no_channel')::boolean, false) THEN
          -- ön kontrol: kullanılabilir kanal yok; bağlantı/satır yok → sonraki çalışmada yeniden denenir
          v_failed := v_failed + 1;
          v_reasons := jsonb_set(v_reasons, '{no_channel}', to_jsonb(COALESCE((v_reasons->>'no_channel')::int, 0) + 1));
        ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'sends') e
                       WHERE e->>'status' IN ('queued', 'skipped_probe')) THEN
          v_sent := v_sent + 1;
        ELSE
          -- ön kontrolden geçti ama gönderim düştü (NO_SECRET / HTTP_ERR); satırlar yazıldı → yeniden denenmez
          v_failed := v_failed + 1;
          v_reasons := jsonb_set(v_reasons, '{send_failed}', to_jsonb(COALESCE((v_reasons->>'send_failed')::int, 0) + 1));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Klinik başına alt transaction: bu kliniğin bağlantısı/satırları geri alınır, döngü sürer.
        -- Kod yalnız sabit PS_* adı; serbest hata metni (veri içerebilir) yazılmaz.
        v_code := CASE WHEN SQLERRM ~ '^PS_[A-Z_]+$' THEN SQLERRM ELSE 'ERROR' END;
        v_failed := v_failed + 1;
        v_reasons := jsonb_set(v_reasons, ARRAY[v_code], to_jsonb(COALESCE((v_reasons->>v_code)::int, 0) + 1));
        RAISE LOG 'run_month_end_pre_statements: clinic % failed (%: %)', v_clinic.id, SQLSTATE, v_code;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('labs', v_labs, 'clinics', v_clinics, 'sent', v_sent, 'skipped', v_skipped,
                            'failed', v_failed, 'failed_reasons', v_reasons, 'periods', to_jsonb(v_periods));
END $function$;

REVOKE ALL ON FUNCTION public.run_month_end_pre_statements(text) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- === 7) Cron (transaction dışında; probe'larda ÇALIŞTIRILMAZ) ===
-- @@CRON_BEGIN@@
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pre-statement-month-end';
SELECT cron.schedule('pre-statement-month-end', '30 6 1 * *', 'select public.run_month_end_pre_statements()');
-- @@CRON_END@@
