-- ============================================================
-- 20260625 — v_upcoming_due_invoices: para birimi ekle (katı per-currency)
--
-- Hatırlatma kartı tek faturanın bakiyesini gösteriyor ama view currency
-- taşımıyordu → € fatura "₺X" (X=EUR rakamı) gibi yanlış sembolle çıkıyordu.
-- currency kolonu SONA eklenir (CREATE OR REPLACE kolon-prefix kuralı).
-- Idempotent.
-- ============================================================

CREATE OR REPLACE VIEW public.v_upcoming_due_invoices AS
SELECT
  i.id,
  i.invoice_number,
  i.due_date,
  (i.total - i.paid_amount)        AS balance,
  c.name                           AS clinic_name,
  (i.due_date - CURRENT_DATE)::INT AS days_until_due,
  COALESCE(i.currency, 'TRY')      AS currency
FROM invoices i
LEFT JOIN clinics c ON c.id = i.clinic_id
WHERE i.lab_id = get_my_lab_id()
  AND i.status NOT IN ('odendi','iptal')
  AND i.due_date IS NOT NULL
  AND i.due_date >= CURRENT_DATE
  AND i.due_date <= CURRENT_DATE + INTERVAL '14 days'
ORDER BY i.due_date ASC;
