-- =====================================================================
-- STAGE 02.3.1 — MEDIUM: payment-submission invoice_id not validated against the
-- submission's lab (potential cross-tenant payment application).
--
-- ROOT CAUSE: submit_payment(...) accepts p_invoice_id and never checks it belongs to
-- the caller's clinic's lab; approve_payment_submission(...) inserts a payment using
-- v_sub.invoice_id without checking it belongs to v_sub.lab_id. A clinic user could
-- attach a FOREIGN lab's invoice_id to a submission; if their own lab then approves it,
-- the payments recalc (keyed on invoice_id) would credit ANOTHER lab's invoice.
--
-- FIX (two layers, atomic):
--   1. submit_payment: reject at submission time if p_invoice_id is not an invoice of
--      the caller's clinic's lab (v_lab_id).
--   2. approve_payment_submission: defense-in-depth — reject approval if the submission's
--      invoice_id does not belong to the submission's lab (catches any submission forged
--      before layer 1 existed).
-- Both bodies are byte-faithful to the live definitions + the added guard.
--
-- INVARIANT: a payment submission (and the payment produced on approval) can only
-- reference an invoice that belongs to the same lab as the submission.
-- =====================================================================
BEGIN;

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

  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
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

COMMIT;
