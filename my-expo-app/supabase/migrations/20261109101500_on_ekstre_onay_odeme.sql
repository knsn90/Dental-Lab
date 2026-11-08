-- 20261109101500_on_ekstre_onay_odeme — plan 3/5 Task 2 ek (kullanıcı kararı 2): ön ekstre ayarı AÇIK lab'da
-- onay bekleyen taslak (status='taslak') ödeme hedefi olmaz. Ayar KAPALIYKEN her yol bugünküyle aynı davranır.
--   * bulk_record_payment: taslaklar seçimden atlanır; tutar kesilmiş faturalara dağılır, artan kısım bugünkü gibi
--     kaydedilmez (fonksiyon yalnız yazdığı satırları döner).
--   * payment_intents BEFORE INSERT (zz_payment_intent_draft_gate): tek faturalık (is_bulk değil) niyet taslağa
--     açılamaz → INV_APPROVAL_REQUIRED; kart çekiminden ÖNCE (erken ret).
--   * confirm_payment_intent: buraya gelindiğinde kart çekilmiş olabilir → taslağa ödeme yazılmaz, tutar kliniğin
--     alacağı olur (_intent_clinic_credit: tahsilat fişi + satır, açık kesilmiş faturalara FIFO; kalan alacak,
--     taslak onaylanınca plan 2 tetikleyicisi uygular). Toplu dalda kesilmiş faturalar zaten tek hedefti; yalnız
--     artan tutarın çapa faturası taslaksa aynı alacak yolu. Fiş idempotency_key = ödeme anahtarıyla aynı.
--   * approve_payment_submission: taslağa bağlı bildirim, hiçbir yazım yapılmadan INV_APPROVAL_REQUIRED (bildirim
--     'pending' kalır; taslak onaylanınca yeniden onaylanabilir ya da tutar tahsilat olarak girilir).
--   CREATE OR REPLACE → mevcut ACL'ler korunur. Yeni fonksiyonlar anon/PUBLIC/authenticated'a kapalı.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1) Kart tutarını kliniğin alacağına (tahsilat fişi) yazar; fiş id'sini döner. İç fonksiyon.
CREATE FUNCTION public._intent_clinic_credit(p_intent_id uuid, p_amount numeric, p_key text, p_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_i       payment_intents%ROWTYPE;
  v_clinic  uuid;
  v_base    text;
  v_rate    numeric;
  v_total   numeric;
  v_today   date;
  v_receipt uuid;
  v_alloc   numeric;
BEGIN
  SELECT * INTO v_i FROM payment_intents WHERE id = p_intent_id;
  v_clinic := COALESCE(v_i.clinic_id, (SELECT clinic_id FROM invoices WHERE id = v_i.invoice_id));
  IF v_clinic IS NULL OR v_i.currency NOT IN ('TRY', 'EUR', 'USD', 'GBP') OR COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'INV_APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_receipt FROM clinic_receipts WHERE lab_id = v_i.lab_id AND idempotency_key = p_key;
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base FROM lab_settings WHERE lab_id = v_i.lab_id;
  v_base  := COALESCE(v_base, 'TRY');
  v_today := lab_today(v_i.lab_id);
  IF v_i.currency = v_base THEN
    v_rate := 1;
  ELSE
    v_rate := get_currency_rate(v_i.lab_id, v_i.currency, v_base, v_today);
    IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1; END IF;
  END IF;
  v_total := round(p_amount * v_rate, 2);

  INSERT INTO clinic_receipts (lab_id, clinic_id, receipt_date, payment_method, reference_no, notes,
                               received_by, base_currency, total_base, allocated_base, idempotency_key)
  VALUES (v_i.lab_id, v_clinic, v_today, 'kart', p_ref,
          'Online ödeme · onay bekleyen taslak → alacak · ' || v_i.provider,
          NULL, v_base, v_total, 0, p_key)
  RETURNING id INTO v_receipt;
  INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
  VALUES (v_receipt, v_i.currency, p_amount, v_rate, v_total);

  v_alloc := alloc_receipt_to_invoices(v_receipt, v_clinic, v_total, v_base, v_today, 'kart');
  UPDATE clinic_receipts SET allocated_base = v_alloc, updated_at = now() WHERE id = v_receipt;
  RETURN v_receipt;
END $function$;

REVOKE ALL ON FUNCTION public._intent_clinic_credit(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

-- 2) Tek faturalık online ödeme niyeti onay bekleyen taslağa açılamaz (kart çekiminden önce)
CREATE FUNCTION public._payment_intent_draft_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(NEW.is_bulk, false) AND NEW.invoice_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM invoices i JOIN lab_settings s ON s.lab_id = i.lab_id
                  WHERE i.id = NEW.invoice_id AND i.status = 'taslak' AND s.invoice_approval_enabled) THEN
    RAISE EXCEPTION 'INV_APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._payment_intent_draft_gate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zz_payment_intent_draft_gate
  BEFORE INSERT ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public._payment_intent_draft_gate();

-- 3) bulk_record_payment
CREATE OR REPLACE FUNCTION public.bulk_record_payment(p_invoice_ids uuid[], p_total_amount numeric, p_payment_method text DEFAULT 'nakit'::text, p_payment_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
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
  v_date      DATE;
  v_gate      BOOLEAN;
BEGIN
  -- A: finance-role authorization (server-side; not UI)
  -- 20261025168000: rol adı yerine yetki (platform yöneticisi helper'ın içinde)
  IF NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'unauthorized: finance role required to record payments' USING ERRCODE='42501';
  END IF;

  IF v_lab_id IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'unauthorized: no tenant context' USING ERRCODE='42501';
  END IF;

  -- Tarih verilmezse lab'ın yerel günü (CURRENT_DATE oturumun saat dilimindedir: UTC)
  v_date := COALESCE(p_payment_date, lab_today(v_lab_id));

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  -- 20261109101500: ön ekstre ayarı açık lab'da onay bekleyen taslak ödeme hedefi olmaz (atlanır;
  -- kalan tutar bugünkü gibi kaydedilmez). Ayar kapalıyken sorgu aynen bugünkü kümeyi seçer.
  v_gate := COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s WHERE s.lab_id = v_lab_id), false);

  FOR v_row IN
    SELECT i.id, (i.total - i.paid_amount) AS balance,
           i.currency, COALESCE(i.rate_at_time, 1) AS rate
      FROM invoices i
     WHERE i.id = ANY(p_invoice_ids)
       AND i.lab_id = v_lab_id
       AND i.status NOT IN ('odendi','iptal')
       AND (NOT v_gate OR i.status <> 'taslak')
       AND (i.total - i.paid_amount) > 0
     ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_to_pay := LEAST(v_row.balance, v_remaining);
    INSERT INTO payments(lab_id, invoice_id, amount, payment_date, payment_method, notes,
                         received_by, currency, rate_at_time, amount_base, base_currency_at_time)
    VALUES (v_lab_id, v_row.id, v_to_pay, v_date, p_payment_method, p_notes,
            auth.uid(), v_row.currency, v_row.rate,
            round(v_to_pay * v_row.rate, 2), v_base_ccy);
    v_remaining := v_remaining - v_to_pay;
    invoice_id  := v_row.id;
    amount_paid := v_to_pay;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 4) confirm_payment_intent
CREATE OR REPLACE FUNCTION public.confirm_payment_intent(p_intent_id uuid, p_provider_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_intent     RECORD;
  v_inv_ccy    text;
  v_payment_id uuid;
  v_idem       text := 'intent:' || p_intent_id::text;
  v_rem        numeric;
  v_inv        RECORD;
  v_take       numeric;
  v_first      uuid;
  v_gate       boolean;
  v_credit     uuid;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_intent bulunamadı: %', p_intent_id;
  END IF;

  IF v_intent.status = 'paid' THEN
    SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
    IF v_payment_id IS NULL THEN
      SELECT id INTO v_payment_id FROM payments
       WHERE idempotency_key LIKE v_idem || ':%' ORDER BY created_at LIMIT 1;
    END IF;
    RETURN COALESCE(v_payment_id, v_intent.id);
  END IF;

  IF v_intent.status NOT IN ('pending','awaiting_3ds','authorized') THEN
    RAISE EXCEPTION 'illegal payment_intent transition: % -> paid', v_intent.status USING ERRCODE='22023';
  END IF;

  -- H-02: expired intents cannot be confirmed (even with a valid provider signature/replay)
  IF v_intent.expires_at IS NOT NULL AND v_intent.expires_at <= now() THEN
    RAISE EXCEPTION 'payment_intent expired at %', v_intent.expires_at USING ERRCODE='22023';
  END IF;

  -- 20261109101500: ön ekstre ayarı açık lab'da kart çekimi gerçekleşmiş olabilir → onay bekleyen taslağa
  -- ödeme yazılmaz, tutar kliniğin alacağı (tahsilat fişi) olur; açık kesilmiş faturalara FIFO uygulanır,
  -- kalanı taslak onaylanınca plan 2 tetikleyicisiyle uygulanır. Ayar kapalıyken akış bugünküyle aynı.
  v_gate := COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s WHERE s.lab_id = v_intent.lab_id), false);

  IF COALESCE(v_intent.is_bulk, false) THEN
    -- TOPLU: tutar kliniğin aynı para birimindeki açık faturalarına EN ESKİDEN
    -- başlayarak dağıtılır. Her fatura için AYRI idempotency_key → callback
    -- tekrarında çift kayıt olmaz.
    v_rem := v_intent.amount;
    FOR v_inv IN
      SELECT i.id, (i.total - i.paid_amount) AS due
        FROM invoices i
       WHERE i.clinic_id = v_intent.clinic_id
         AND COALESCE(i.currency, 'TRY') = v_intent.currency
         AND i.status IN ('kesildi','kismi_odendi')
         AND i.total > i.paid_amount
       ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC, i.id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_rem <= 0;
      v_take := LEAST(v_rem, v_inv.due);
      CONTINUE WHEN v_take <= 0;

      INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method,
                            payment_date, notes, idempotency_key)
      VALUES (v_intent.lab_id, v_inv.id, v_take, v_intent.currency, 'kart', lab_today(v_intent.lab_id),
              'Online toplu ödeme · ' || v_intent.provider || COALESCE(' · ref:' || p_provider_ref, ''),
              v_idem || ':' || v_inv.id::text)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_payment_id;

      IF v_first IS NULL THEN v_first := v_payment_id; END IF;
      v_rem := v_rem - v_take;
    END LOOP;

    -- Intent açıldıktan sonra lab nakit tahsilat girdiyse bakiye küçülmüş
    -- olabilir; kalan tutar ÇAPA faturaya yazılır ki para kayıt dışı kalmasın
    -- (fazla ödeme = kliniğin alacağı olarak görünür).
    IF v_rem > 0 AND v_gate
       AND EXISTS (SELECT 1 FROM invoices WHERE id = v_intent.invoice_id AND status = 'taslak') THEN
      v_credit := public._intent_clinic_credit(p_intent_id, v_rem, v_idem || ':rest', p_provider_ref);
    ELSIF v_rem > 0 THEN
      INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method,
                            payment_date, notes, idempotency_key)
      VALUES (v_intent.lab_id, v_intent.invoice_id, v_rem, v_intent.currency, 'kart', lab_today(v_intent.lab_id),
              'Online toplu ödeme · fazla tutar (alacak) · ' || v_intent.provider,
              v_idem || ':rest')
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_payment_id;
      IF v_first IS NULL THEN v_first := v_payment_id; END IF;
    END IF;

    v_payment_id := COALESCE(v_first, v_credit);
  ELSIF v_gate AND EXISTS (SELECT 1 FROM invoices WHERE id = v_intent.invoice_id AND status = 'taslak') THEN
    v_payment_id := public._intent_clinic_credit(p_intent_id, v_intent.amount, v_idem, p_provider_ref);
  ELSE
    SELECT currency INTO v_inv_ccy FROM invoices WHERE id = v_intent.invoice_id;

    INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method, payment_date, notes, idempotency_key)
    VALUES (v_intent.lab_id, v_intent.invoice_id, v_intent.amount,
            COALESCE(v_inv_ccy, v_intent.currency),
            'kart', lab_today(v_intent.lab_id),
            'Online ödeme · ' || v_intent.provider || COALESCE(' · ref:' || p_provider_ref, ''),
            v_idem)
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_payment_id;

    IF v_payment_id IS NULL THEN
      SELECT id INTO v_payment_id FROM payments WHERE idempotency_key = v_idem LIMIT 1;
    END IF;
  END IF;

  UPDATE payment_intents
     SET status='paid', paid_at=now(), provider_ref=COALESCE(p_provider_ref, provider_ref), updated_at=now()
   WHERE id = p_intent_id;

  RETURN v_payment_id;
END;
$function$;

-- 5) approve_payment_submission
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

  -- 20261109101500: ön ekstre ayarı açıkken bildirim onay bekleyen taslağa yazılamaz (ödeme taslağı
  -- kesinleştirirdi). Hiçbir yan etki olmadan reddedilir; bildirim 'pending' kalır — taslak onaylanınca
  -- yeniden onaylanabilir ya da tutar tahsilat (alacak) olarak girilir.
  IF EXISTS (SELECT 1 FROM invoices i JOIN lab_settings s ON s.lab_id = i.lab_id
              WHERE i.id = v_sub.invoice_id AND i.status = 'taslak' AND s.invoice_approval_enabled) THEN
    RAISE EXCEPTION 'INV_APPROVAL_REQUIRED' USING ERRCODE = '42501';
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

COMMIT;
