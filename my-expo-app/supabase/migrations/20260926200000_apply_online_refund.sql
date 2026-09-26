-- Online ödeme iadesi: para geri döndüyse FATURA da geri açılmalı.
--
-- SORUN: `refund_payment_intent` yalnızca payment_intents.status'u
-- 'refunded' yapıyordu; `payments` satırına dokunmadığı için fatura
-- "ödendi" görünmeye devam ediyordu. Demo POS'ta para hareketi olmadığı
-- için fark edilmiyordu; iyzico canlıya alındı (2026-09-26), artık gerçek.
--
-- NEDEN NEGATİF SATIR DEĞİL: payments üzerinde `amount > 0` CHECK'i var
-- (payments_amount_check). Ters kayıt atmak için o kısıtı gevşetmek
-- gerekirdi; tüm finans raporları SUM(amount) ile çalıştığı için negatif
-- satır riski daha büyük. Bunun yerine intent'in ÜRETTİĞİ ödeme satırları
-- azaltılır; tam iadede satır silinir. Fatura durumu mevcut trigger ile
-- kendiliğinden yeniden hesaplanır.
--
-- İZ KAYBOLMAZ: iade `payment_intents` (status + refunded_at),
-- `payment_attempts` (edge function yazar) ve aktivite kaydında durur.
--
-- DAĞITIM SIRASI: toplu ödemede tahsilat en ESKİ faturadan başlayarak
-- dağıtılmıştı; iade TERS yönde, en YENİ faturadan geri alınır. Böylece
-- kısmi iadede eski borçlar kapalı kalır.

CREATE OR REPLACE FUNCTION public.apply_online_refund(
  p_intent_id   uuid,
  p_amount      numeric,
  p_provider_ref text DEFAULT NULL
)
RETURNS TABLE (
  refunded      numeric,
  fully_refunded boolean,
  touched_rows  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_intent   RECORD;
  v_idem     text;
  v_rem      numeric;
  v_pay      RECORD;
  v_take     numeric;
  v_rows     integer := 0;
  v_paid_sum numeric;
BEGIN
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödeme kaydı bulunamadı' USING ERRCODE = 'P0002';
  END IF;
  IF v_intent.status NOT IN ('paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'Yalnız tahsil edilmiş ödeme iade edilebilir (durum: %)', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  v_idem := 'intent:' || p_intent_id::text;

  -- Bu intent'in ürettiği ödeme satırlarının KALAN toplamı
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
    FROM payments
   WHERE idempotency_key = v_idem OR idempotency_key LIKE v_idem || ':%';

  v_rem := round(COALESCE(p_amount, v_paid_sum), 2);
  IF v_rem <= 0 THEN
    RAISE EXCEPTION 'Geçerli bir iade tutarı girin' USING ERRCODE = '22023';
  END IF;
  IF v_rem > v_paid_sum THEN
    RAISE EXCEPTION 'İade tutarı tahsil edilenden fazla olamaz (kalan: %)', v_paid_sum
      USING ERRCODE = '22023';
  END IF;

  FOR v_pay IN
    SELECT p.id, p.amount, p.invoice_id
      FROM payments p
     WHERE p.idempotency_key = v_idem OR p.idempotency_key LIKE v_idem || ':%'
     ORDER BY p.created_at DESC, p.id DESC     -- en yeniden geri al
     FOR UPDATE
  LOOP
    EXIT WHEN v_rem <= 0;
    v_take := LEAST(v_rem, v_pay.amount);

    IF v_take >= v_pay.amount THEN
      DELETE FROM payments WHERE id = v_pay.id;
    ELSE
      UPDATE payments
         SET amount = amount - v_take,
             notes  = COALESCE(notes, '') || ' · kısmi iade ' || v_take::text
       WHERE id = v_pay.id;
    END IF;

    v_rows := v_rows + 1;
    v_rem  := v_rem - v_take;
  END LOOP;

  UPDATE payment_intents
     SET status = CASE WHEN round(COALESCE(p_amount, v_paid_sum), 2) >= v_paid_sum
                       THEN 'refunded' ELSE 'partially_refunded' END,
         refunded_at  = now(),
         provider_ref = COALESCE(p_provider_ref, provider_ref),
         updated_at   = now()
   WHERE id = p_intent_id;

  RETURN QUERY SELECT
    round(COALESCE(p_amount, v_paid_sum), 2),
    round(COALESCE(p_amount, v_paid_sum), 2) >= v_paid_sum,
    v_rows;
END;
$$;

-- Yalnız sunucu (edge function, service_role) çağırabilir: iade kararı
-- sağlayıcının yanıtına bağlıdır, istemci veremez.
REVOKE ALL ON FUNCTION public.apply_online_refund(uuid, numeric, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.apply_online_refund(uuid, numeric, text) IS
  'Sağlayıcı iadesi onaylandıktan SONRA faturayı geri açar: intent''in ödeme satırlarını en yeniden başlayarak azaltır/siler. Yalnız service_role.';
