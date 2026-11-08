-- 20261108102000_tahsilat_iptal_alacak_iade — final inceleme I-1 + I-2 (plan 2/5).
--   I-1: Fatura iptal edilince (→ 'iptal') o faturaya tahsilat fişinden (receipt_id) yazılmış ödemeler silinir,
--        her fişin allocated_base'i silinen amount_base toplamı kadar düşer (0'ın altına inmez; fişler FOR UPDATE),
--        sonra _apply_clinic_credit_core(clinic) serbest kalan alacağı kliniğin diğer açık kesinleşmiş faturalarına
--        FIFO ile uygular (iptal fatura 'kesildi/kismi_odendi' süzgecine girmediği için hariçtir). İND alacağının
--        iptalde dönmesinin (_sd_invoice_credit_trg) fiş karşılığı. Fişsiz ödemeler (doğrudan tahsilat, İND/DZ) dokunulmaz.
--        Tetikleyici adı zz_tr_invoice_receipt_release: AFTER tetikleyiciler ad sırasıyla çalışır →
--        zz_cash_sync_invoice < zz_sd_invoice_credit (İND önce iade edilip uygulanır, kesinleşme yolundaki sırayla aynı)
--        < zz_tr_invoice_receipt_credit (iptalde hiçbir şey yapmaz) < zz_tr_invoice_receipt_release.
--        zzz_invoice_issued_lock BEFORE'dur; iptal → iptal paid_amount güncellemesine izin verir.
--        Silme yolunda: payments_sd_guard yalnız 'indirim' satırını kilitler (fiş ödemesi 'indirim' olamaz:
--        clinic_receipts_payment_method_check); recalc_invoice_payment_state iptal faturada yalnız paid_amount yazar
--        (status iptal kalır); _cash_sync fiş ödemesini zaten kasaya yazmaz. Bypass gerekmedi. net.http_post yok.
--   I-2: _send_payment_reminder_core metninde "Açık borç: …" dönem cümlesinden ÖNCEYE alınır (WhatsApp 200 karakter
--        kesiminde tutar ortadan bölünmesin). Gövdede başka değişiklik yok; ACL CREATE OR REPLACE ile korunur.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- === I-1: iptalde fiş ödemesi alacağa döner ===
CREATE FUNCTION public._trg_invoice_release_receipt_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'iptal' OR OLD.status IS NOT DISTINCT FROM 'iptal' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = NEW.id AND p.receipt_id IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  -- Fişler kilitlenir (çekirdekle aynı FOR UPDATE; sabit sıra)
  PERFORM 1 FROM clinic_receipts r
   WHERE r.id IN (SELECT p.receipt_id FROM payments p
                   WHERE p.invoice_id = NEW.id AND p.receipt_id IS NOT NULL)
   ORDER BY r.id
   FOR UPDATE;

  WITH d AS (
    DELETE FROM payments p
     WHERE p.invoice_id = NEW.id AND p.receipt_id IS NOT NULL
    RETURNING p.receipt_id, COALESCE(p.amount_base, 0) AS amount_base
  ), s AS (
    SELECT d.receipt_id, sum(d.amount_base) AS freed FROM d GROUP BY d.receipt_id
  )
  UPDATE clinic_receipts r
     SET allocated_base = greatest(r.allocated_base - s.freed, 0), updated_at = now()
    FROM s
   WHERE r.id = s.receipt_id;

  IF NEW.clinic_id IS NOT NULL THEN
    PERFORM _apply_clinic_credit_core(NEW.clinic_id);
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public._trg_invoice_release_receipt_credit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._trg_invoice_release_receipt_credit() TO service_role;

DROP TRIGGER IF EXISTS zz_tr_invoice_receipt_release ON public.invoices;
CREATE TRIGGER zz_tr_invoice_receipt_release
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status = 'iptal' AND OLD.status IS DISTINCT FROM 'iptal')
  EXECUTE FUNCTION public._trg_invoice_release_receipt_credit();

-- === I-2: "Açık borç" dönem listesinden önce ===
CREATE OR REPLACE FUNCTION public._send_payment_reminder_core(p_lab_id uuid, p_clinic_id uuid, p_invoice_id uuid, p_tone text, p_message text, p_severity text, p_channels text[], p_sent_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_name TEXT; v_total_due NUMERIC := 0; v_overdue_due NUMERIC := 0; v_overdue_count INT := 0;
  v_reminder_id UUID; v_title TEXT; v_body TEXT; v_recipients INT := 0; v_user_ids UUID[];
  v_url TEXT; v_secret TEXT; v_anon TEXT;
  v_due_text TEXT; v_by_ccy JSONB := '{}'::jsonb;
  v_admin_ids UUID[];
  v_period_text TEXT;
BEGIN
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  -- 20261026110000: tutar tek kaynaktan (kliniğin görünen bakiyesi, avans düşülmüş; lab günü)
  SELECT a.total_due, a.overdue_due, a.overdue_count, a.due_text, a.by_ccy
    INTO v_total_due, v_overdue_due, v_overdue_count, v_due_text, v_by_ccy
    FROM public._reminder_amounts(p_lab_id, p_clinic_id, p_invoice_id) a;
  IF COALESCE(v_total_due, 0) <= 0 THEN RETURN NULL; END IF;

  v_title := CASE p_severity WHEN 'urgent' THEN '🔴 ACİL: Ödeme Bekliyor' WHEN 'warning' THEN '⚠️ Ödeme Hatırlatması' ELSE 'Ödeme Hatırlatması' END;
  IF p_invoice_id IS NULL THEN v_period_text := public._overdue_periods_text(public._reminder_periods(p_lab_id, p_clinic_id), public.lab_today(p_lab_id)); END IF;
  v_body := CONCAT_WS(' ',
    CASE WHEN v_overdue_count > 0 THEN v_overdue_count::TEXT || ' fatura vadesini aştı.' ELSE NULL END,
    'Açık borç: ' || COALESCE(v_due_text, TO_CHAR(v_total_due, 'FM999G999G990D00')) || '.',
    v_period_text,
    CASE WHEN p_message IS NOT NULL AND LENGTH(BTRIM(p_message)) > 0 THEN '— ' || BTRIM(p_message) ELSE NULL END);
  INSERT INTO payment_reminders (lab_id, clinic_id, invoice_id, channel, tone, subject, body, status, sent_by, sent_at, total_due, overdue_due, overdue_count, message, severity)
  VALUES (p_lab_id, p_clinic_id, p_invoice_id, 'in_app', p_tone, v_title, v_body, 'sent', p_sent_by, NOW(), v_total_due, v_overdue_due, v_overdue_count, NULLIF(BTRIM(p_message),''), p_severity)
  RETURNING id INTO v_reminder_id;
  v_url := '/(clinic)/finance?tab=overview';
  WITH inserted AS (
    INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    SELECT p.id, p_lab_id, 'payment', v_title, v_body,
      CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
      COALESCE(p_invoice_id, p_clinic_id), v_url,
      jsonb_build_object('reminder_id', v_reminder_id, 'clinic_id', p_clinic_id, 'invoice_id', p_invoice_id,
        'total_due', v_total_due, 'totals_by_currency', v_by_ccy,
        'overdue_due', v_overdue_due, 'overdue_count', v_overdue_count,
        'severity', p_severity, 'message', p_message, 'channels', to_jsonb(p_channels))
    FROM profiles p WHERE p.clinic_id = p_clinic_id AND p.user_type IN ('clinic_admin','clinic_secretary','doctor')
         AND public._user_can_view_clinic_billing(p.id, p_clinic_id)
    RETURNING user_id
  )
  SELECT COUNT(*), array_agg(user_id) INTO v_recipients, v_user_ids FROM inserted;
  UPDATE payment_reminders SET recipients_count = v_recipients WHERE id = v_reminder_id;
  IF (p_channels @> ARRAY['email']) AND v_user_ids IS NOT NULL AND array_length(v_user_ids,1) > 0 THEN
    BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
    BEGIN SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;
    IF v_anon IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-email-notification',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
          body := jsonb_build_object('userIds', to_jsonb(v_user_ids), 'category','payment','notificationId', v_reminder_id,
            'payload', jsonb_build_object('title', v_title, 'body', v_body, 'actionUrl', v_url,
              'resourceType', CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
              'resourceId', COALESCE(p_invoice_id, p_clinic_id)::text,
              'extra', jsonb_build_object('clinicName', v_clinic_name, 'totalDue', v_total_due,
                                          'totalsByCurrency', v_by_ccy, 'dueText', v_due_text,
                                          'overdueCount', v_overdue_count))));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;
  -- ── ADMİN NÜSHASI (WhatsApp) ─────────────────────────────────────────────
  -- Kullanıcı kararı: hatırlatma gönderildiğinde bir kopyası lab yöneticilerine
  -- (admin + lab müdürü) KESİNLİKLE WhatsApp'tan gider — kliniğin kanal
  -- politikasından bağımsız. Uygulama içi bildirim YAZILMAZ (admin kutusu
  -- kirlenmesin); doğrudan send-whatsapp-meta çağrılır, __admin_copy işaretiyle.
  -- Hata hatırlatmayı asla bozmaz.
  BEGIN
    SELECT array_agg(p.id) INTO v_admin_ids
      FROM profiles p
     WHERE (p.lab_id = p_lab_id OR p.id = p_lab_id)
       AND COALESCE(p.is_active, true)
       AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
        AND public._user_has_lab_finance(p.id, p_lab_id);
    IF v_admin_ids IS NOT NULL AND array_length(v_admin_ids, 1) > 0 THEN
      IF v_anon IS NULL THEN
        BEGIN SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='net_anon_key' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_anon := NULL; END;
      END IF;
      IF v_secret IS NULL THEN
        BEGIN SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_fn_secret' LIMIT 1; EXCEPTION WHEN OTHERS THEN v_secret := NULL; END;
      END IF;
      IF v_anon IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/send-whatsapp-meta',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon,'apikey', v_anon,'x-notify-secret', COALESCE(v_secret,'')),
          body := jsonb_build_object(
            'userIds', to_jsonb(v_admin_ids),
            'category', 'payment',
            'resource_type', CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
            'resource_id', COALESCE(p_invoice_id, p_clinic_id)::text,
            'payload', jsonb_build_object(
              '__admin_copy', true,
              '__clinic_name', COALESCE(v_clinic_name, 'Klinik'),
              '__body', v_body,
              '__lab_id', p_lab_id::text,
              'reminder_id', v_reminder_id)));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_reminder_id;
END; $function$
;

COMMIT;
