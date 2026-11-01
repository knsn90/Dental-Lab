-- 20261025168000_definer_finance_guards.sql
-- Rol görünürlüğü son incelemesi, adım 2: yetkili modda (SECURITY DEFINER) çalışan finans
-- fonksiyonları RLS'i atlıyor; paket A/C'deki kural bunlara da uygulanır.
--  Lab tarafı: tahsilat kaydı, ödeme bildirimi onay/ret, hatırlatma (tek/toplu) artık rol adına
--    (manager/admin/accountant) değil lab_can_manage_invoices() yetkisine bakar. Doğrudan fatura
--    oluşturma da aynı yetkiyi ister; teslimde otomatik taslak (tetikleyici) serbest kalır.
--    send_payment_reminder(fatura, ton, …) sürümünde hiç kontrol yoktu (anon dahil) → eklendi,
--    anon/public EXECUTE kaldırıldı.
--  Klinik tarafı: açık bakiye, ödeme bildirimi, online ödeme başlatma can_view_clinic_billing()
--    ister; son hatırlatma yalnız lab finans yetkilisine ya da klinik fatura yetkilisine döner.
-- Geri alma: rollbacks/20261025168000_definer_finance_guards.down.sql

CREATE OR REPLACE FUNCTION public.approve_payment_submission(p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_type  TEXT;
  v_role       TEXT;
  v_sub        payment_submissions%ROWTYPE;
  v_payment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Onaylama yetkiniz yok.';
  END IF;

  SELECT * INTO v_sub FROM payment_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödeme bildirimi bulunamadı.';
  END IF;
  IF v_sub.lab_id IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Farklı bir laboratuvarın bildirimini onaylayamazsınız.';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Bildirim zaten işlenmiş (durum: %).', v_sub.status;
  END IF;

  -- payments tablosuna kayıt düşer (invoice_id varsa)
  -- invoice_id zorunlu olduğu için yoksa hata fırlatıyoruz —
  -- ileride "genel hesap ödemesi" eklenirse buraya genişletilebilir.
  IF v_sub.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Fatura bağlanmamış bildirim — şu an manuel müdahale gerekiyor.';
  END IF;

  -- 02.3.1 defense-in-depth: bildirimin faturası, bildirimin laboratuvarına ait olmalı
  -- (02.3.1 öncesi forge edilmiş bir bildirim cross-tenant onaylanamasın)
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = v_sub.invoice_id AND lab_id = v_sub.lab_id
  ) THEN
    RAISE EXCEPTION 'Bildirimdeki fatura farklı bir laboratuvara ait — onaylanamaz.'
      USING errcode = '42501';
  END IF;

  INSERT INTO payments (
    lab_id, invoice_id, amount, payment_date, payment_method, reference_no, notes, received_by
  ) VALUES (
    v_sub.lab_id, v_sub.invoice_id, v_sub.amount, v_sub.payment_date,
    -- payments tablosu CHECK'i havale/nakit/kart/cek/diger kabul ediyor; eft → havale eşle
    CASE WHEN v_sub.payment_method = 'eft' THEN 'havale' ELSE v_sub.payment_method END,
    COALESCE(v_sub.reference_no, ''),
    CONCAT_WS(' · ',
      CASE WHEN v_sub.payment_method = 'eft' THEN '[EFT]' END,
      CASE WHEN v_sub.bank_name   IS NOT NULL THEN 'Banka: ' || v_sub.bank_name   END,
      CASE WHEN v_sub.sender_name IS NOT NULL THEN 'Gönderen: ' || v_sub.sender_name END,
      v_sub.notes
    ),
    v_user_id
  )
  RETURNING id INTO v_payment_id;

  -- Submission'ı onayla
  UPDATE payment_submissions
     SET status = 'approved',
         reviewed_by = v_user_id,
         reviewed_at = NOW(),
         approved_payment_id = v_payment_id
   WHERE id = p_submission_id;

  RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_payment_submission(p_submission_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_type  TEXT;
  v_role       TEXT;
  v_sub        payment_submissions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Onaylama yetkiniz yok.';
  END IF;

  SELECT * INTO v_sub FROM payment_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödeme bildirimi bulunamadı.';
  END IF;
  IF v_sub.lab_id IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Farklı bir laboratuvarın bildirimini reddedemezsiniz.';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Bildirim zaten işlenmiş (durum: %).', v_sub.status;
  END IF;

  UPDATE payment_submissions
     SET status = 'rejected',
         reviewed_by = v_user_id,
         reviewed_at = NOW(),
         reject_reason = NULLIF(BTRIM(p_reason), '')
   WHERE id = p_submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_payment_reminders_bulk(p_message text DEFAULT NULL::text, p_severity text DEFAULT 'warning'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID := auth.uid();
  v_user_type TEXT;
  v_role      TEXT;
  v_lab_id    UUID;
  v_clinic    RECORD;
  v_sent      INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Yetki yok.';
  END IF;
  v_lab_id := get_my_lab_id();

  FOR v_clinic IN
    SELECT clinic_id
    FROM invoices
    WHERE lab_id = v_lab_id
      AND status IN ('kesildi','kismi_odendi')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND clinic_id IS NOT NULL
    GROUP BY clinic_id
    HAVING SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))) > 0
  LOOP
    BEGIN
      PERFORM send_payment_reminder(v_clinic.clinic_id, NULL, p_message, p_severity);
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN v_sent;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_payment_reminder(p_clinic_id uuid, p_invoice_id uuid DEFAULT NULL::uuid, p_message text DEFAULT NULL::text, p_severity text DEFAULT 'info'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID := auth.uid(); v_user_type TEXT; v_role TEXT; v_lab_id UUID; v_tone TEXT; v_channels TEXT[]; v_total NUMERIC := 0; v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  -- 20261025168000: rol adı yerine yetki — faturaları yönetebilen (RLS ile aynı kural)
  IF NOT public.lab_can_manage_invoices() THEN RAISE EXCEPTION 'Hatırlatma gönderme yetkiniz yok.'; END IF;
  IF p_severity NOT IN ('info','warning','urgent') THEN RAISE EXCEPTION 'Geçersiz öncelik seviyesi.'; END IF;
  SELECT lab_id INTO v_lab_id FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı.'; END IF;
  IF v_lab_id <> get_my_lab_id() THEN RAISE EXCEPTION 'Farklı bir laboratuvarın kliniğine hatırlatma gönderemezsiniz.'; END IF;
  IF p_invoice_id IS NOT NULL THEN
    SELECT GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)) INTO v_total FROM invoices WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))),0) INTO v_total FROM invoices WHERE clinic_id = p_clinic_id AND status IN ('kesildi','kismi_odendi');
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Bu klinik için açık borç yok, hatırlatma gerekmiyor.'; END IF;
  v_tone := CASE p_severity WHEN 'urgent' THEN 'firm' WHEN 'warning' THEN 'standard' ELSE 'gentle' END;
  SELECT COALESCE(payment_reminder_channels, ARRAY['in_app','email']) INTO v_channels FROM lab_settings WHERE lab_id = v_lab_id LIMIT 1;
  IF v_channels IS NULL THEN v_channels := ARRAY['in_app','email']; END IF;
  v_id := _send_payment_reminder_core(v_lab_id, p_clinic_id, p_invoice_id, v_tone, p_message, p_severity, v_channels, v_user_id);
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.bulk_record_payment(p_invoice_ids uuid[], p_total_amount numeric, p_payment_method text DEFAULT 'nakit'::text, p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, amount_paid numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row       RECORD;
  v_remaining NUMERIC := p_total_amount;
  v_to_pay    NUMERIC;
  v_lab_id    UUID := get_my_lab_id();
  v_base_ccy  TEXT;
BEGIN
  -- A: finance-role authorization (server-side; not UI)
  -- 20261025168000: rol adı yerine yetki (platform yöneticisi helper'ın içinde)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'unauthorized: finance role required to record payments' USING ERRCODE='42501';
  END IF;

  IF v_lab_id IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'unauthorized: no tenant context' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  FOR v_row IN
    SELECT i.id, (i.total - i.paid_amount) AS balance,
           i.currency, COALESCE(i.rate_at_time, 1) AS rate
      FROM invoices i
     WHERE i.id = ANY(p_invoice_ids)
       AND i.lab_id = v_lab_id
       AND i.status NOT IN ('odendi','iptal')
       AND (i.total - i.paid_amount) > 0
     ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_to_pay := LEAST(v_row.balance, v_remaining);
    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes,
                         received_by, currency, rate_at_time, amount_base, base_currency_at_time)
    VALUES (v_lab_id, v_row.id, v_to_pay, p_payment_date, p_payment_method, p_notes,
            auth.uid(), v_row.currency, v_row.rate,
            round(v_to_pay * v_row.rate, 2), v_base_ccy);
    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_payment_reminder(p_invoice_id uuid, p_tone text DEFAULT 'standard'::text, p_channel text DEFAULT 'in_app'::text, p_template_id uuid DEFAULT NULL::uuid, p_recipient text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lab_id     UUID;
  v_clinic_id  UUID;
  v_template   RECORD;
  v_body       TEXT;
  v_subject    TEXT;
  v_id         UUID;
BEGIN
  -- 20261025168000: bu sürümde yetki kontrolü yoktu (oturumsuz çağrı dahil)
  IF auth.uid() IS NULL OR NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  SELECT lab_id, clinic_id INTO v_lab_id, v_clinic_id FROM invoices WHERE id = p_invoice_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;
  IF v_lab_id IS DISTINCT FROM public.get_my_lab_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  -- Şablonu seç (parametre verildiyse o; yoksa lab'ın varsayılan tone şablonu)
  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM reminder_templates WHERE id = p_template_id AND lab_id = v_lab_id;
  ELSE
    SELECT * INTO v_template
      FROM reminder_templates
     WHERE lab_id = v_lab_id AND tone = p_tone AND active = true
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    -- Şablon yoksa otomatik seed
    PERFORM seed_default_reminder_templates(v_lab_id);
    SELECT * INTO v_template
      FROM reminder_templates
     WHERE lab_id = v_lab_id AND tone = p_tone AND active = true
     ORDER BY is_default DESC LIMIT 1;
  END IF;

  v_body    := render_reminder_template(v_template.body, p_invoice_id);
  v_subject := CASE WHEN v_template.subject IS NOT NULL
                    THEN render_reminder_template(v_template.subject, p_invoice_id)
                    ELSE NULL END;

  INSERT INTO payment_reminders
    (lab_id, invoice_id, clinic_id, template_id, channel, tone, subject, body, recipient, status, sent_by)
  VALUES
    (v_lab_id, p_invoice_id, v_clinic_id, v_template.id, p_channel, p_tone, v_subject, v_body, p_recipient,
     CASE WHEN p_channel = 'in_app' THEN 'sent' ELSE 'queued' END,
     auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_work_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
  v_base       TEXT;
  v_currency   TEXT;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id, wo.is_urgent
    INTO v_lab_id, v_doctor_id, v_clinic_id, v_is_urgent
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

  -- C-1 tenant guard: an authenticated caller must own the work order's lab
  -- (same rule as invoices_lab_insert RLS). NULL auth.uid() = trusted internal/
  -- service/trigger context (anon EXECUTE is revoked below, so anon cannot reach here).
  IF auth.uid() IS NOT NULL
     AND NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emri için fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  -- 20261025168000: doğrudan (RPC) fatura oluşturma yalnız faturaları yönetebilene açık.
  -- Tetikleyici yolu (teslimde otomatik taslak) serbest: teslimi yapanın finans yetkisi olmayabilir.
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0
     AND NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING errcode = '42501';
  END IF;

  SELECT io.invoice_id INTO v_invoice_id
  FROM invoice_orders io
  JOIN invoices i ON i.id = io.invoice_id
  WHERE io.work_order_id = p_work_order_id AND i.status <> 'iptal'
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  v_due_date := CURRENT_DATE + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', CURRENT_DATE, v_due_date, v_currency, auth.uid())
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

  IF NOT EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_invoice_id) THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    SELECT v_invoice_id,
           COALESCE(work_type, 'Laboratuvar hizmeti') ||
             CASE
               WHEN tooth_numbers IS NOT NULL AND array_length(tooth_numbers, 1) > 0
               THEN ' (Dişler: ' || array_to_string(tooth_numbers, ', ') || ')'
               ELSE ''
             END,
           GREATEST(COALESCE(array_length(tooth_numbers, 1), 1), 1),
           0,
           1
    FROM work_orders WHERE id = p_work_order_id;
  END IF;

  IF v_is_urgent THEN
    SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
      FROM lab_settings WHERE lab_id = v_lab_id;
    IF v_rate > 0 THEN
      SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
        FROM invoice_items WHERE invoice_id = v_invoice_id;
      IF v_subtotal > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1,
                ROUND(v_subtotal * v_rate / 100.0, 2),
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_open_balance_by_currency()
 RETURNS TABLE(currency text, balance numeric, invoice_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(i.currency, 'TRY')::text,
         round(SUM(i.total - i.paid_amount), 2),
         COUNT(*)::int
    FROM invoices i
   WHERE i.clinic_id = get_my_clinic_id()
     AND get_my_clinic_id() IS NOT NULL
     -- 20261025168000: bakiye = klinik fatura yetkisi
     AND public.can_view_clinic_billing(get_my_clinic_id())
     AND i.status IN ('kesildi', 'kismi_odendi')
     AND i.total > i.paid_amount
   GROUP BY COALESCE(i.currency, 'TRY')
   HAVING SUM(i.total - i.paid_amount) > 0
   ORDER BY 2 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.last_payment_reminder(p_clinic_id uuid)
 RETURNS TABLE(id uuid, sent_at timestamp with time zone, severity text, message text, total_due numeric, overdue_count integer, recipients_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pr.id, pr.sent_at, pr.severity, pr.message,
         pr.total_due, pr.overdue_count, pr.recipients_count
    FROM payment_reminders pr
   WHERE pr.clinic_id = p_clinic_id
     -- 20261025168000: yalnız o lab'ın finans yetkilisi ya da kliniğin fatura yetkilisi
     AND (public.is_platform_admin()
          OR (public.lab_can_view_finance() AND pr.lab_id = public.get_my_lab_id())
          OR public.can_view_clinic_billing(p_clinic_id))
   ORDER BY pr.sent_at DESC
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.submit_payment(p_clinic_id uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_invoice_id uuid DEFAULT NULL::uuid, p_doctor_id uuid DEFAULT NULL::uuid, p_reference_no text DEFAULT NULL::text, p_bank_name text DEFAULT NULL::text, p_sender_name text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  UUID := auth.uid();
  v_lab_id   UUID;
  v_id       UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- lab_id'yi klinikten al
  SELECT lab_id INTO v_lab_id FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Klinik bulunamadı veya lab_id eksik.';
  END IF;

  -- Yetki kontrolü: clinic_admin / clinic_secretary aynı klinikten
  -- veya doktor aynı klinikten
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_user_id
      AND p.clinic_id = p_clinic_id
      AND p.user_type IN ('clinic_admin','clinic_secretary')
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_user_id
      AND p.user_type = 'doctor'
      AND p.clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Bu klinik için ödeme bildirme yetkiniz yok.';
  END IF;

  -- 20261025168000: ödeme bildirimi = klinik fatura yetkisi (yönetici, yetkili sekreter,
  -- yöneticisi olmayan klinikte hekim)
  IF NOT public.can_view_clinic_billing(p_clinic_id) THEN
    RAISE EXCEPTION 'Bu klinik için ödeme bildirme yetkiniz yok.';
  END IF;

  -- 02.3.1: bağlanan fatura, kliniğin laboratuvarına ait olmalı (cross-tenant engeli)
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = p_invoice_id AND lab_id = v_lab_id
  ) THEN
    RAISE EXCEPTION 'Seçili fatura bu laboratuvara ait değil.' USING errcode = '42501';
  END IF;

  -- Tutar/yöntem kontrolleri
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Geçersiz tutar.';
  END IF;
  IF p_payment_method NOT IN ('havale','eft','kart','nakit','cek','diger') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi.';
  END IF;
  IF p_payment_method IN ('havale','eft') AND (p_reference_no IS NULL OR LENGTH(BTRIM(p_reference_no)) = 0) THEN
    RAISE EXCEPTION 'Havale/EFT için dekont/referans no zorunlu.';
  END IF;

  INSERT INTO payment_submissions (
    lab_id, clinic_id, doctor_id, invoice_id,
    amount, payment_method, payment_date,
    reference_no, bank_name, sender_name, receipt_url, notes,
    status, submitted_by
  ) VALUES (
    v_lab_id, p_clinic_id, p_doctor_id, p_invoice_id,
    p_amount, p_payment_method, p_payment_date,
    NULLIF(BTRIM(p_reference_no), ''),
    NULLIF(BTRIM(p_bank_name), ''),
    NULLIF(BTRIM(p_sender_name), ''),
    NULLIF(BTRIM(p_receipt_url), ''),
    NULLIF(BTRIM(p_notes), ''),
    'pending', v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_my_bulk_payment_intent(p_currency text, p_amount numeric)
 RETURNS TABLE(public_token text, amount numeric, currency text, expires_at timestamp with time zone, reused boolean, provider text, invoice_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic   uuid;
  v_ccy      text := COALESCE(NULLIF(trim(p_currency), ''), 'TRY');
  v_balance  numeric;
  v_count    integer;
  v_anchor   record;
  v_provider text;
  v_amount   numeric;
  v_token    text;
  v_exp      timestamptz;
BEGIN
  v_clinic := get_my_clinic_id();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Bu işlem yalnız klinik kullanıcıları içindir' USING ERRCODE = '42501';
  END IF;

  -- 20261025168000: online ödeme = klinik fatura yetkisi (yönetici, yetkili sekreter,
  -- yöneticisi olmayan klinikte hekim)
  IF NOT public.can_view_clinic_billing(v_clinic) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  -- O para birimindeki açık bakiye + en eski fatura (çapa)
  SELECT round(SUM(i.total - i.paid_amount), 2), COUNT(*)::int
    INTO v_balance, v_count
    FROM invoices i
   WHERE i.clinic_id = v_clinic
     AND COALESCE(i.currency, 'TRY') = v_ccy
     AND i.status IN ('kesildi', 'kismi_odendi')
     AND i.total > i.paid_amount;

  IF COALESCE(v_balance, 0) <= 0 THEN
    RAISE EXCEPTION 'Bu para biriminde ödenecek bakiye yok' USING ERRCODE = '22023';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Geçerli bir tutar girin' USING ERRCODE = '22023';
  END IF;
  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'Tutar toplam bakiyeyi aşamaz (%s)', v_balance USING ERRCODE = '22023';
  END IF;

  SELECT i.id, i.lab_id, i.doctor_id
    INTO v_anchor
    FROM invoices i
   WHERE i.clinic_id = v_clinic
     AND COALESCE(i.currency, 'TRY') = v_ccy
     AND i.status IN ('kesildi', 'kismi_odendi')
     AND i.total > i.paid_amount
   ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC, i.id ASC
   LIMIT 1;

  SELECT pc.provider INTO v_provider
    FROM provider_credentials pc
   WHERE pc.lab_id = v_anchor.lab_id AND pc.type = 'payment' AND pc.is_active
   LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Laboratuvar henüz online ödeme sağlayıcısı tanımlamamış'
      USING ERRCODE = '22023';
  END IF;

  -- Aynı tutarlı, süresi geçmemiş toplu intent varsa yenisi açılmaz.
  SELECT pi.public_token, pi.expires_at
    INTO v_token, v_exp
    FROM payment_intents pi
   WHERE pi.clinic_id = v_clinic
     AND pi.is_bulk
     AND pi.currency = v_ccy
     AND pi.amount   = v_amount
     AND pi.provider = v_provider
     AND pi.status IN ('pending', 'awaiting_3ds', 'authorized')
     AND pi.expires_at > now()
   ORDER BY pi.created_at DESC
   LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN QUERY SELECT v_token, v_amount, v_ccy, v_exp, true, v_provider, v_count;
    RETURN;
  END IF;

  v_token := generate_payment_token();
  v_exp   := now() + interval '3 days';   -- toplu tutar bakiyeyle birlikte eskir

  INSERT INTO payment_intents (
    invoice_id, lab_id, clinic_id, doctor_id, public_token,
    amount, currency, provider, status, expires_at, created_by, is_bulk
  ) VALUES (
    v_anchor.id, v_anchor.lab_id, v_clinic, v_anchor.doctor_id, v_token,
    v_amount, v_ccy, v_provider, 'pending', v_exp, auth.uid(), true
  );

  RETURN QUERY SELECT v_token, v_amount, v_ccy, v_exp, false, v_provider, v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_my_invoice_payment_intent(p_invoice_id uuid)
 RETURNS TABLE(public_token text, amount numeric, currency text, expires_at timestamp with time zone, reused boolean, provider text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic   uuid;
  v_inv      record;
  v_balance  numeric;
  v_token    text;
  v_exp      timestamptz;
  v_provider text;
BEGIN
  v_clinic := get_my_clinic_id();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Bu işlem yalnız klinik kullanıcıları içindir' USING ERRCODE = '42501';
  END IF;

  -- 20261025168000: online ödeme = klinik fatura yetkisi (yönetici, yetkili sekreter,
  -- yöneticisi olmayan klinikte hekim)
  IF NOT public.can_view_clinic_billing(v_clinic) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  SELECT i.id, i.lab_id, i.clinic_id, i.doctor_id, i.total, i.paid_amount, i.currency, i.status
    INTO v_inv
    FROM invoices i
   WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  -- Sahiplik: fatura kliniğe ya da kliniğin hekimine ait olmalı.
  IF v_inv.clinic_id IS DISTINCT FROM v_clinic
     AND NOT EXISTS (
       SELECT 1 FROM doctors d
        WHERE d.id = v_inv.doctor_id AND d.clinic_id = v_clinic
     )
  THEN
    RAISE EXCEPTION 'Bu fatura kliniğinize ait değil' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status = 'taslak' THEN
    RAISE EXCEPTION 'Taslak fatura için ödeme başlatılamaz' USING ERRCODE = '22023';
  ELSIF v_inv.status = 'iptal' THEN
    RAISE EXCEPTION 'İptal edilmiş fatura için ödeme başlatılamaz' USING ERRCODE = '22023';
  ELSIF v_inv.status = 'odendi' THEN
    RAISE EXCEPTION 'Bu fatura zaten tahsil edildi' USING ERRCODE = '22023';
  END IF;

  v_balance := round(COALESCE(v_inv.total, 0) - COALESCE(v_inv.paid_amount, 0), 2);
  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'Ödenecek bakiye yok' USING ERRCODE = '22023';
  END IF;

  -- Lab'ın aktif POS sağlayıcısı (Entegrasyonlar → POS · Online Ödeme).
  SELECT pc.provider INTO v_provider
    FROM provider_credentials pc
   WHERE pc.lab_id = v_inv.lab_id AND pc.type = 'payment' AND pc.is_active
   LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Laboratuvar henüz online ödeme sağlayıcısı tanımlamamış'
      USING ERRCODE = '22023';
  END IF;

  -- 1) Geçerli bekleyen intent varsa onu döndür.
  SELECT pi.public_token, pi.expires_at
    INTO v_token, v_exp
    FROM payment_intents pi
   WHERE pi.invoice_id   = v_inv.id
     AND pi.status       IN ('pending', 'awaiting_3ds', 'authorized')
     AND pi.expires_at   > now()
     AND pi.amount       = v_balance
     AND pi.provider     = v_provider   -- sağlayıcı değiştiyse eski token ölü
   ORDER BY pi.created_at DESC
   LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN QUERY SELECT v_token, v_balance, COALESCE(v_inv.currency, 'TRY')::text, v_exp, true, v_provider;
    RETURN;
  END IF;

  v_token := generate_payment_token();
  v_exp   := now() + interval '7 days';

  INSERT INTO payment_intents (
    invoice_id, lab_id, clinic_id, doctor_id, public_token,
    amount, currency, provider, status, expires_at, created_by
  ) VALUES (
    v_inv.id, v_inv.lab_id, v_inv.clinic_id, v_inv.doctor_id, v_token,
    v_balance, COALESCE(v_inv.currency, 'TRY'), v_provider,
    'pending', v_exp, auth.uid()
  );

  RETURN QUERY SELECT v_token, v_balance, COALESCE(v_inv.currency, 'TRY')::text, v_exp, false, v_provider;
END;
$function$;


revoke execute on function public.send_payment_reminder(uuid, text, text, uuid, text) from public, anon;
