-- v_clinic_balance_ccy: faturaya bağlanmamış tahsilatı da düş.
--
-- Cari liste ekranı bu view'i okuyor; v_clinic_balance'a eklenen alacak
-- buraya yansımadığı için tahsilatı girilmiş klinik hâlâ borçlu görünüyordu.
--
-- Alacak BAZ para biriminde tutuluyor → yalnız fişin base_currency'siyle
-- eşleşen satıra yazılır. Farklı dövizdeki satırlara dağıtmak, olmayan bir
-- kur dönüşümü uydurmak olurdu.
--
-- Gövde uygulama anındaki CANLI tanımdan alındı (scratch/v_ccy_before.sql);
-- değişen yalnız `balance` ifadesi ve SONA eklenen `unallocated_credit`.
-- (CREATE OR REPLACE VIEW araya sütun ekleyemiyor.)
--
-- BİLİNEN SINIR: view `JOIN invoices` kullanıyor, yani o para biriminde hiç
-- faturası olmayan ama alacağı olan klinik bu listede görünmez. Mevcut
-- davranış korundu; düzeltmek join'i yeniden kurmayı gerektirir.

CREATE OR REPLACE VIEW public.v_clinic_balance_ccy
WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric)
      - COALESCE(cr.credit, 0::numeric) AS balance,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)), 0::numeric) AS aging_current,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 1 AND (CURRENT_DATE - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) >= 31 AND (CURRENT_DATE - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (CURRENT_DATE - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < CURRENT_DATE AND i.paid_amount < i.total) AS oldest_overdue_date,
    COALESCE(cr.credit, 0::numeric) AS unallocated_credit
   FROM clinics c
     JOIN invoices i ON i.clinic_id = c.id
     -- Alacak (klinik, baz para birimi) basina ONCEDEN toplanir: korele alt
     -- sorgu GROUP BY ifadesini tanimiyor ("subquery uses ungrouped column").
     -- Her fatura satiri en cok BIR kredi satiriyla eslesir -> cogaltma yok.
     LEFT JOIN ( SELECT r.clinic_id, r.base_currency,
                        sum(r.total_base - r.allocated_base) AS credit
                   FROM clinic_receipts r
                  GROUP BY r.clinic_id, r.base_currency) cr
       ON cr.clinic_id = c.id AND cr.base_currency = COALESCE(i.currency, 'TRY'::text)
  GROUP BY c.id, c.name, i.lab_id, (COALESCE(i.currency, 'TRY'::text)), cr.credit;
