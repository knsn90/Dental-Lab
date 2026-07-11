-- Cari bakiyeye orijinal döviz (₺ yanında €/$ gösterimi için) ekle: tek (TL dışı) para birimi
-- varsa currency + ham (orijinal) tutarlar. CREATE OR REPLACE — sona kolon, DROP gerekmez.
CREATE OR REPLACE VIEW public.v_clinic_balance AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE i.status <> 'iptal'::text) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric))) FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS total_paid,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS balance,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 1 AND (CURRENT_DATE - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 31 AND (CURRENT_DATE - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE i.status <> 'iptal'::text AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date,
    CASE WHEN count(DISTINCT i.currency) FILTER (WHERE i.status <> 'iptal'::text AND i.currency IS NOT NULL AND i.currency <> 'TRY') = 1
         THEN max(i.currency) FILTER (WHERE i.status <> 'iptal'::text AND i.currency <> 'TRY') END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE i.status <> 'iptal'::text AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE i.status <> 'iptal'::text AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS total_paid_original,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE i.status <> 'iptal'::text AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS balance_original
   FROM clinics c
     LEFT JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id;
