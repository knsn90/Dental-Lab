-- v_clinic_balance: kullanılmamış tahsilat alacağını bakiyeden düş.
--
-- Gövde, uygulama anındaki CANLI tanımdan alındı (scratch/v_clinic_balance_before.sql);
-- migration dosyalarındaki sürüme güvenilmedi. Değişen YALNIZ iki yer:
--   1. yeni `unallocated_credit` sütunu (EN SONA eklendi: CREATE OR REPLACE VIEW
--      var olan sütunların sırasını/adını değiştiremiyor, araya eklemek
--      "cannot change name of view column" hatası veriyor; DROP etmek ise
--      view'e bağlı her şeyi kırardı),
--   2. `balance` ondan düşülüyor.
-- Diğer tüm sütunlar (aging, overdue, currency, *_original) birebir korundu.
--
-- Alacak, korele alt sorgu ile çekiliyor: view `security_invoker = true` olduğu
-- için clinic_receipts'in RLS'i devrede, yani lab kapsamı kendiliğinden doğru.
-- Bu yüzden ayrıca lab_id filtresi YOK — faturası hiç olmayan (i.lab_id NULL)
-- bir klinikte alacağın kaybolmaması için de bu gerekli.
--
-- v_clinic_balance_ccy (para birimi kırılımı) BİLEREK değiştirilmedi: alacak baz
-- para biriminde tutuluyor, kırılıma dağıtılamaz.

CREATE OR REPLACE VIEW public.v_clinic_balance
WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric))) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric)
      - COALESCE(( SELECT sum(r.total_base - r.allocated_base)
                     FROM clinic_receipts r
                    WHERE r.clinic_id = c.id), 0::numeric) AS balance,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 1 AND (CURRENT_DATE - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 31 AND (CURRENT_DATE - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date,
        CASE
            WHEN count(DISTINCT i.currency) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text) = 1 THEN max(i.currency) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency <> 'TRY'::text)
            ELSE NULL::text
        END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS total_paid_original,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS balance_original,
    COALESCE(( SELECT sum(r.total_base - r.allocated_base)
                 FROM clinic_receipts r
                WHERE r.clinic_id = c.id), 0::numeric) AS unallocated_credit
   FROM clinics c
     LEFT JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id;
