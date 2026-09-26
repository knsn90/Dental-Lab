-- Ödeme sayfası hangi sağlayıcıyla çalıştığını bilsin.
--
-- NEDEN: sayfada "Sandbox: CVC 000 → fail · 999 → 3DS" ipucu SABİT yazıyordu.
-- Bu demo POS'un test kuralı; iyzico canlıya alınınca gerçek bir kliniğe
-- "CVC'ye 999 yaz" demiş olduk (kullanıcı canlı sayfada gördü, 2026-09-26).
-- İpucu artık yalnız provider='demo' iken çizilecek.
--
-- Sağlayıcı adı hassas veri değil: 3DS adımında zaten bankanın/sağlayıcının
-- ekranı görünüyor. Dönüş TİPİ değiştiği için DROP + CREATE şart.

DROP FUNCTION IF EXISTS public.fetch_public_payment_intent(text);

CREATE FUNCTION public.fetch_public_payment_intent(p_token text)
RETURNS TABLE(
  intent_id uuid, amount numeric, currency text, installments integer,
  status text, expires_at timestamptz, invoice_number text,
  invoice_due_date date, clinic_name text, doctor_name text, lab_name text,
  provider text
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    pi.id,
    pi.amount,
    pi.currency,
    pi.installments,
    pi.status,
    pi.expires_at,
    i.invoice_number,
    i.due_date,
    c.name AS clinic_name,
    d.full_name AS doctor_name,
    l.name AS lab_name,
    pi.provider
  FROM payment_intents pi
  JOIN invoices i ON i.id = pi.invoice_id
  LEFT JOIN clinics c ON c.id = pi.clinic_id
  LEFT JOIN doctors d ON d.id = pi.doctor_id
  JOIN labs l ON l.id = pi.lab_id
  WHERE pi.public_token = p_token
    AND pi.expires_at > now()
    AND pi.status IN ('pending','awaiting_3ds','authorized','paid');
$function$;

GRANT EXECUTE ON FUNCTION public.fetch_public_payment_intent(text) TO anon, authenticated;
