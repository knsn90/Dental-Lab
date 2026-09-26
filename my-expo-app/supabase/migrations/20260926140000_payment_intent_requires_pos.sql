-- Klinik ödeme intent'i: lab'ın AKTİF online POS'u yoksa açılmasın.
--
-- NEDEN: eskiden intent her koşulda açılıyordu; lab Entegrasyonlar'da POS
-- tanımlamamışsa kullanıcı kart formuna kadar gidip orada "Aktif POS sağlayıcı
-- yok" hatası alıyordu. Kontrol başa alındı: ölü intent üretilmiyor ve hata
-- düğmeye basıldığı anda, anlaşılır biçimde dönüyor.
--
-- Ayrıca dönen satıra `provider` eklendi (iyzico / demo …) — istemci hangi
-- sağlayıcıya gideceğini bilsin. Dönüş TİPİ değiştiği için DROP + CREATE şart;
-- CREATE OR REPLACE dönüş tipini değiştiremez.

DROP FUNCTION IF EXISTS public.create_my_invoice_payment_intent(uuid);

CREATE FUNCTION public.create_my_invoice_payment_intent(
  p_invoice_id uuid
)
RETURNS TABLE (
  public_token text,
  amount       numeric,
  currency     text,
  expires_at   timestamptz,
  reused       boolean,
  provider     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.create_my_invoice_payment_intent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_invoice_payment_intent(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_my_invoice_payment_intent(uuid) IS
  'Klinik/hekim kendi faturası için ödeme intent''i açar. Tutar sunucuda hesaplanır, lab''ın AKTİF POS sağlayıcısı zorunludur, geçerli intent yeniden kullanılır.';
