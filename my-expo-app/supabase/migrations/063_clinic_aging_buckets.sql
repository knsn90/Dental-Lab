-- ═════════════════════════════════════════════════════════════════════════
-- 063_clinic_aging_buckets.sql
--   Cari yaşlandırma (Aging) — fatura bakiyelerini vade aşımı yaşına göre
--   4 kova'ya ayırır:
--     • current   : vadesi gelmemiş veya bugünkü
--     • bucket_30 : 1–30 gün gecikmiş
--     • bucket_60 : 31–60 gün gecikmiş
--     • bucket_90 : 61+ gün gecikmiş
--
--   v_clinic_balance view'ına bu 4 kolon eklenir.
--   ClinicBalanceScreen aging buckets segmentini gösterir.
-- ═════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_clinic_balance AS
SELECT
  c.id              AS clinic_id,
  c.name            AS clinic_name,
  i.lab_id          AS lab_id,

  COUNT(DISTINCT i.id) FILTER (WHERE i.status <> 'iptal')                    AS invoice_count,
  COALESCE(SUM(i.total)       FILTER (WHERE i.status <> 'iptal'), 0)         AS total_billed,
  COALESCE(SUM(i.paid_amount) FILTER (WHERE i.status <> 'iptal'), 0)         AS total_paid,
  COALESCE(SUM(i.total - i.paid_amount) FILTER (WHERE i.status <> 'iptal'), 0) AS balance,

  -- Toplam vadesi geçen
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.due_date < CURRENT_DATE
      AND i.paid_amount < i.total
  ), 0) AS overdue_amount,

  -- Aging buckets ──────────────────────────────────────────────────────────
  -- current: vade bugün veya gelecekte
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.paid_amount < i.total
      AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)
  ), 0) AS aging_current,

  -- 1–30 gün gecikmiş
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.paid_amount < i.total
      AND i.due_date IS NOT NULL
      AND CURRENT_DATE - i.due_date BETWEEN 1 AND 30
  ), 0) AS aging_30,

  -- 31–60 gün gecikmiş
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.paid_amount < i.total
      AND i.due_date IS NOT NULL
      AND CURRENT_DATE - i.due_date BETWEEN 31 AND 60
  ), 0) AS aging_60,

  -- 61+ gün gecikmiş
  COALESCE(SUM(i.total - i.paid_amount) FILTER (
    WHERE i.status <> 'iptal'
      AND i.paid_amount < i.total
      AND i.due_date IS NOT NULL
      AND CURRENT_DATE - i.due_date > 60
  ), 0) AS aging_90,

  MIN(i.due_date) FILTER (
    WHERE i.status <> 'iptal'
      AND i.due_date < CURRENT_DATE
      AND i.paid_amount < i.total
  ) AS oldest_overdue_date

FROM clinics c
LEFT JOIN invoices i ON i.clinic_id = c.id
GROUP BY c.id, c.name, i.lab_id;

GRANT SELECT ON v_clinic_balance TO authenticated;
