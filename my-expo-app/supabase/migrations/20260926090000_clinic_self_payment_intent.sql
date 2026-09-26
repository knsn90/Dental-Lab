-- Klinik/hekim kendi faturasını ödeyebilsin: fatura bazında ödeme intent'i.
--
-- NEDEN RPC: `payment_intents` RLS'i yalnız LAB kullanıcısına açık
-- (payment_intents_lab_insert/select → lab_id = get_my_lab_id()). Klinik
-- profillerinde lab_id NULL olduğu için klinik kullanıcısı bu tabloya ne
-- yazabiliyor ne okuyabiliyor — ki doğrusu da bu: aksi halde aynı lab'ın
-- BAŞKA kliniklerinin ödeme token'larını da görürdü.
--
-- Bu fonksiyon SECURITY DEFINER'dır ve sahipliği KENDİ doğrular:
-- fatura ya doğrudan çağıranın kliniğine, ya da o kliniğin bir hekimine ait
-- olmalıdır. Başka hiçbir satır dönmez, hiçbir satır yazılmaz.
--
-- Tutar DAİMA sunucuda hesaplanır (total - paid_amount); istemciden tutar
-- ALINMAZ — aksi halde klinik kendi borcunu 1 ₺ yazıp "ödendi" yapabilirdi.
--
-- Yeniden kullanım: aynı fatura için geçerli (süresi dolmamış, bakiyeyle
-- birebir aynı tutarlı) bekleyen bir intent varsa yenisi AÇILMAZ, mevcut
-- token döner. Böylece her tıklamada ölü token yığılmaz.

CREATE OR REPLACE FUNCTION public.create_my_invoice_payment_intent(
  p_invoice_id uuid
)
RETURNS TABLE (
  public_token text,
  amount       numeric,
  currency     text,
  expires_at   timestamptz,
  reused       boolean
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

  -- Taslak fatura bakiyeye girmez; iptal/ödenmiş için ödeme açılmaz.
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

  -- 1) Geçerli bekleyen intent varsa onu döndür.
  SELECT pi.public_token, pi.expires_at
    INTO v_token, v_exp
    FROM payment_intents pi
   WHERE pi.invoice_id   = v_inv.id
     AND pi.status       IN ('pending', 'awaiting_3ds', 'authorized')
     AND pi.expires_at   > now()
     AND pi.amount       = v_balance
   ORDER BY pi.created_at DESC
   LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN QUERY SELECT v_token, v_balance, COALESCE(v_inv.currency, 'TRY')::text, v_exp, true;
    RETURN;
  END IF;

  -- 2) Yoksa yeni intent. Sağlayıcı lab'ın aktif POS kimliğinden gelir.
  SELECT pc.provider INTO v_provider
    FROM provider_credentials pc
   WHERE pc.lab_id = v_inv.lab_id AND pc.type = 'payment' AND pc.is_active
   LIMIT 1;

  v_token := generate_payment_token();
  v_exp   := now() + interval '7 days';

  INSERT INTO payment_intents (
    invoice_id, lab_id, clinic_id, doctor_id, public_token,
    amount, currency, provider, status, expires_at, created_by
  ) VALUES (
    v_inv.id, v_inv.lab_id, v_inv.clinic_id, v_inv.doctor_id, v_token,
    v_balance, COALESCE(v_inv.currency, 'TRY'), COALESCE(v_provider, 'demo'),
    'pending', v_exp, auth.uid()
  );

  RETURN QUERY SELECT v_token, v_balance, COALESCE(v_inv.currency, 'TRY')::text, v_exp, false;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_invoice_payment_intent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_invoice_payment_intent(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_my_invoice_payment_intent(uuid) IS
  'Klinik/hekim kendi faturası için ödeme intent''i açar (tutar sunucuda hesaplanır, mevcut geçerli intent yeniden kullanılır).';
