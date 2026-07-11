-- ============================================================
-- 20260625 — Cari bakiye PER-CURRENCY (klinik + para birimi bazlı)
--
-- AMAÇ (ERP / katı per-currency):
--   v_clinic_balance her şeyi base'e (× rate_at_time) indiriyor ve orijinal
--   tutarı yalnız klinik TEK (TL dışı) para birimi taşıyorsa veriyor. Çok-para
--   birimli klinikte per-currency bakiye veremez.
--
--   Bu view her (klinik, para birimi) için BİR satır döner; tüm tutarlar
--   ORİJİNAL para biriminde (base'e çevrilmez, asla toplanmaz). Böylece
--   ABC Dental → EUR 1.250 · TRY 8.450 · USD 0 bağımsız gösterilebilir.
--
-- security_invoker = true → invoices RLS uygulanır (lab izolasyonu garanti).
-- Idempotent: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE VIEW public.v_clinic_balance_ccy
WITH (security_invoker = true) AS
 SELECT
    c.id   AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY') AS currency,
    count(DISTINCT i.id) FILTER (WHERE i.status <> 'iptal'::text) AS invoice_count,
    COALESCE(sum(i.total)               FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount)         FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS total_paid,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE i.status <> 'iptal'::text), 0::numeric) AS balance,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status <> 'iptal'::text AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    -- Aging buckets — hepsi orijinal para biriminde
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total
        AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) BETWEEN 1 AND 30), 0::numeric) AS aging_30,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60), 0::numeric) AS aging_60,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status <> 'iptal'::text AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (
      WHERE i.status <> 'iptal'::text AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date
   FROM clinics c
     JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id, COALESCE(i.currency, 'TRY');

GRANT SELECT ON public.v_clinic_balance_ccy TO authenticated;

-- ============================================================
-- DOĞRULAMA:
--   SELECT clinic_name, currency, balance FROM v_clinic_balance_ccy
--     WHERE clinic_id = '...' ORDER BY currency;
--   → her para birimi ayrı satır, orijinal tutarda.
-- ============================================================
