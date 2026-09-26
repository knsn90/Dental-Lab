-- Ödeme ekranında laboratuvarın logosu görünsün.
--
-- Ödeme sayfası müşterinin kartını girdiği yer; kimden ödeme istendiği
-- görsel olarak belli olmalı. Şu an yalnız lab ADI yazıyor.
-- Dönüş tipi değiştiği için DROP + CREATE.

DROP FUNCTION IF EXISTS public.fetch_public_payment_intent(text);

CREATE FUNCTION public.fetch_public_payment_intent(p_token text)
RETURNS TABLE(
  intent_id uuid, amount numeric, currency text, installments integer,
  status text, expires_at timestamptz, invoice_number text,
  invoice_due_date date, clinic_name text, doctor_name text, lab_name text,
  provider text, lab_logo_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    pi.id, pi.amount, pi.currency, pi.installments, pi.status, pi.expires_at,
    i.invoice_number, i.due_date,
    c.name AS clinic_name, d.full_name AS doctor_name,
    l.name AS lab_name, pi.provider, l.logo_url
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
