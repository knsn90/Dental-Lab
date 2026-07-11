-- ============================================================
-- 20260626 — Cari bakiyeden TASLAK faturaları dışla (hem base hem per-ccy view)
--
-- SORUN: v_clinic_balance ve v_clinic_balance_ccy yalnız 'iptal'i dışlıyordu
-- (status <> 'iptal') → 'taslak' (kesilmemiş) faturalar da borca/kesilene
-- sayılıyordu. Dashboard "Mali Durum" €420 gösterirken finans "Bekleyen"
-- (status IN kesildi/kismi_odendi) €125 gösteriyordu. Taslak gerçek alacak DEĞİL.
--
-- ÇÖZÜM: balance/total_billed/aging vb. tüm FILTER'larda
--   i.status <> 'iptal'  →  i.status NOT IN ('iptal','taslak')
-- Böylece bakiye = yalnız KESİLMİŞ faturalar (kesildi/kismi_odendi/odendi),
-- "Bekleyen" ile tutarlı. Hem klinik hem lab finansını etkiler (doğru davranış).
-- Idempotent: CREATE OR REPLACE (kolon sırası korunur).
-- ============================================================

-- ── 1) Base view (dashboard Mali Durum kartı + lab cari) ──
CREATE OR REPLACE VIEW public.v_clinic_balance AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE i.status NOT IN ('iptal','taslak')) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric))) FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS total_paid,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS balance,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 1 AND (CURRENT_DATE - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 31 AND (CURRENT_DATE - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date,
    CASE WHEN count(DISTINCT i.currency) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.currency IS NOT NULL AND i.currency <> 'TRY') = 1
         THEN max(i.currency) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.currency <> 'TRY') END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS total_paid_original,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE i.status NOT IN ('iptal','taslak') AND i.currency IS NOT NULL AND i.currency <> 'TRY'), 0::numeric) AS balance_original
   FROM clinics c
     LEFT JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id;

-- KRİTİK: RLS uygula (veri sızıntısını kapat). security_invoker yoktu → view tüm
-- klinikleri döndürüyordu, dashboard data[0] yanlış kliniği (en yüksek bakiye) seçiyordu.
-- v_clinic_balance_ccy zaten security_invoker=true olduğu için finans paneli doğruydu.
ALTER VIEW public.v_clinic_balance SET (security_invoker = true);

-- ── 2) Per-currency view (finans Cari bakiye ekranı) ──
CREATE OR REPLACE VIEW public.v_clinic_balance_ccy
WITH (security_invoker = true) AS
 SELECT
    c.id   AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY') AS currency,
    count(DISTINCT i.id) FILTER (WHERE i.status NOT IN ('iptal','taslak')) AS invoice_count,
    COALESCE(sum(i.total)               FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount)         FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS total_paid,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE i.status NOT IN ('iptal','taslak')), 0::numeric) AS balance,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total
        AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) BETWEEN 1 AND 30), 0::numeric) AS aging_30,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60), 0::numeric) AS aging_60,
    COALESCE(sum(i.total - i.paid_amount) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.paid_amount < i.total
        AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (
      WHERE i.status NOT IN ('iptal','taslak') AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date
   FROM clinics c
     JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id, COALESCE(i.currency, 'TRY');

GRANT SELECT ON public.v_clinic_balance_ccy TO authenticated;
