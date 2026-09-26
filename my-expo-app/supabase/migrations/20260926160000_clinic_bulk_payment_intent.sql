-- Klinik TOPLU online ödeme: tek karttan, birden çok faturayı kapatan ödeme.
--
-- İHTİYAÇ: klinik 28 açık faturayı tek tek ödemek zorunda kalmasın; toplam
-- bakiyeyi ya da kendi belirlediği kısmi tutarı tek işlemde ödeyebilsin.
--
-- TASARIM:
--  • `payment_intents.invoice_id` NOT NULL → toplu ödeme de bir faturaya
--    "çapalanır" (en eski açık fatura). Çapa yalnız kayıt içindir.
--  • Yeni `is_bulk` bayrağı: ödeme onaylanınca tutar TEK faturaya değil,
--    kliniğin AYNI PARA BİRİMİNDEKİ açık faturalarına EN ESKİDEN başlayarak
--    dağıtılır (nakit toplu tahsilatta kullanılan kuralın aynısı).
--  • Tutar her zaman sunucuda doğrulanır: 0 < tutar ≤ o para birimindeki
--    toplam bakiye.
--
-- İDEMPOTENS: her fatura satırı için ayrı idempotency_key
-- ('intent:<id>:<invoice_id>') → callback iki kez gelse bile çift ödeme yok.

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS is_bulk boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payment_intents.is_bulk IS
  'true → onaylandığında tutar kliniğin açık faturalarına en eskiden başlayarak dağıtılır.';

-- ─────────────────────────────────────────────────────────────────────
-- 1) Kliniğin para birimi bazında açık bakiyesi (istemci de okuyabilsin)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_open_balance_by_currency()
RETURNS TABLE (currency text, balance numeric, invoice_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(i.currency, 'TRY')::text,
         round(SUM(i.total - i.paid_amount), 2),
         COUNT(*)::int
    FROM invoices i
   WHERE i.clinic_id = get_my_clinic_id()
     AND get_my_clinic_id() IS NOT NULL
     AND i.status IN ('kesildi', 'kismi_odendi')
     AND i.total > i.paid_amount
   GROUP BY COALESCE(i.currency, 'TRY')
   HAVING SUM(i.total - i.paid_amount) > 0
   ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION public.my_open_balance_by_currency() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_open_balance_by_currency() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Toplu ödeme intent'i
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_my_bulk_payment_intent(
  p_currency text,
  p_amount   numeric
)
RETURNS TABLE (
  public_token text,
  amount       numeric,
  currency     text,
  expires_at   timestamptz,
  reused       boolean,
  provider     text,
  invoice_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.create_my_bulk_payment_intent(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_bulk_payment_intent(text, numeric) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Onay: toplu intent'te tutar faturalara EN ESKİDEN dağıtılır
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_payment_intent(
  p_intent_id uuid,
  p_provider_ref text DEFAULT NULL::text
)
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
      VALUES (v_intent.lab_id, v_inv.id, v_take, v_intent.currency, 'kart', CURRENT_DATE,
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
    IF v_rem > 0 THEN
      INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method,
                            payment_date, notes, idempotency_key)
      VALUES (v_intent.lab_id, v_intent.invoice_id, v_rem, v_intent.currency, 'kart', CURRENT_DATE,
              'Online toplu ödeme · fazla tutar (alacak) · ' || v_intent.provider,
              v_idem || ':rest')
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_payment_id;
      IF v_first IS NULL THEN v_first := v_payment_id; END IF;
    END IF;

    v_payment_id := v_first;
  ELSE
    SELECT currency INTO v_inv_ccy FROM invoices WHERE id = v_intent.invoice_id;

    INSERT INTO payments (lab_id, invoice_id, amount, currency, payment_method, payment_date, notes, idempotency_key)
    VALUES (v_intent.lab_id, v_intent.invoice_id, v_intent.amount,
            COALESCE(v_inv_ccy, v_intent.currency),
            'kart', CURRENT_DATE,
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
