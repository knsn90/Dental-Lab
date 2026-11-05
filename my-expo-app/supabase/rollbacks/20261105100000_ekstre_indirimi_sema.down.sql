-- Geri alma: 20261105100000_ekstre_indirimi_sema
-- Canlı önceki durum: rollbacks/20261105100000_ekstre_indirimi_sema.before.txt
-- DİKKAT: clinic_statement_discounts düşer → kayıtlı ekstre indirimleri kaybolur; faturalara dağıtılmış
-- 'indirim' payları (payments) silinir ve o faturaların paid_amount/status'u yeniden hesaplanır
-- (indirim hiç verilmemiş gibi açık bakiyeye döner).
-- Önce bu şemaya bağlı sonraki görevlerin (Görev 3 RPC'leri/tetikleyicisi, Görev 4 raporları) geri alınması gerekir.
-- Görünümler DROP + CREATE ile kurulur (CREATE OR REPLACE eklenen statement_discount_total sütununu
-- düşüremez); görünümlere bağımlı nesne yok (pg_depend: yalnız kendi satır tipi ve kuralı — .before.txt).
-- Gövdesinde adıyla kullanan 5 sql fonksiyonu (bağımlılık izlenmez) yeniden kurulan görünümü adıyla bulur.
BEGIN;

-- 1) Görünümler: canlı tanımlar, security_invoker ve .before.txt'teki ACL birebir
DROP VIEW public.v_clinic_balance_ccy;
DROP VIEW public.v_clinic_balance;

CREATE VIEW public.v_clinic_balance_ccy WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) - COALESCE(cr.credit, 0::numeric) AS balance,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= lab_today(i.lab_id))), 0::numeric) AS aging_current,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 1 AND (lab_today(i.lab_id) - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 31 AND (lab_today(i.lab_id) - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total) AS oldest_overdue_date,
    COALESCE(cr.credit, 0::numeric) AS unallocated_credit,
    GREATEST(0::numeric, COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) - COALESCE(cr.credit, 0::numeric)) AS overdue_net
   FROM clinics c
     JOIN invoices i ON i.clinic_id = c.id
     LEFT JOIN ( SELECT r.clinic_id,
            r.base_currency,
            sum(r.total_base - r.allocated_base) AS credit
           FROM clinic_receipts r
          GROUP BY r.clinic_id, r.base_currency) cr ON cr.clinic_id = c.id AND cr.base_currency = COALESCE(i.currency, 'TRY'::text)
  GROUP BY c.id, c.name, i.lab_id, (COALESCE(i.currency, 'TRY'::text)), cr.credit;

CREATE VIEW public.v_clinic_balance WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric))) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) - COALESCE(( SELECT sum(r.total_base - r.allocated_base) AS sum
           FROM clinic_receipts r
          WHERE r.clinic_id = c.id), 0::numeric) AS balance,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= lab_today(i.lab_id))), 0::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 1 AND (lab_today(i.lab_id) - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 31 AND (lab_today(i.lab_id) - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total) AS oldest_overdue_date,
        CASE
            WHEN count(DISTINCT i.currency) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text) = 1 THEN max(i.currency) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency <> 'TRY'::text)
            ELSE NULL::text
        END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS total_paid_original,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.currency IS NOT NULL AND i.currency <> 'TRY'::text), 0::numeric) AS balance_original,
    COALESCE(( SELECT sum(r.total_base - r.allocated_base) AS sum
           FROM clinic_receipts r
          WHERE r.clinic_id = c.id), 0::numeric) AS unallocated_credit,
    GREATEST(0::numeric, COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) - COALESCE(( SELECT sum(r.total_base - r.allocated_base) AS sum
           FROM clinic_receipts r
          WHERE r.clinic_id = c.id), 0::numeric)) AS overdue_net
   FROM clinics c
     LEFT JOIN invoices i ON i.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id;

-- ACL = {postgres=arwdDxtm/postgres,anon=m/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}
-- (CREATE VIEW şema varsayılan yetkilerini verir; önce hepsi alınır, sonra canlı sırayla verilir)
REVOKE ALL ON public.v_clinic_balance_ccy FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON public.v_clinic_balance_ccy TO anon;
GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON public.v_clinic_balance_ccy TO authenticated;
GRANT ALL ON public.v_clinic_balance_ccy TO service_role;
REVOKE ALL ON public.v_clinic_balance FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON public.v_clinic_balance TO anon;
GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON public.v_clinic_balance TO authenticated;
GRANT ALL ON public.v_clinic_balance TO service_role;

-- 2) Tahsilat logu: canlı tanım
CREATE OR REPLACE FUNCTION public.trg_log_payment_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.log_activity(
    'payment_recorded', 'payment', NEW.id,
    NEW.payment_method || ' ' || NEW.amount::text || ' ' || COALESCE(NEW.currency,''),
    jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount,
                       'currency', NEW.currency, 'method', NEW.payment_method,
                       'payment_date', NEW.payment_date),
    NEW.lab_id, COALESCE(NEW.received_by, auth.uid()));
  RETURN NEW;   -- log_activity swallows its own errors; cannot break the payment
END;
$function$;

-- 3) 'indirim' payları (eski yöntem kısıtı bunlarla eklenemez). Silme tetikleyicileri faturaları yeniden hesaplar.
SELECT set_config('siman.sd_write', 'on', true);
DELETE FROM public.payments WHERE payment_method = 'indirim' OR statement_discount_id IS NOT NULL;

-- 4) Koruma
DROP TRIGGER IF EXISTS payments_sd_guard ON public.payments;
DROP FUNCTION IF EXISTS public._payments_sd_guard();

-- 5) payments kısıtları ve bağ sütunu
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_sd_consistency;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK ((payment_method = ANY (ARRAY['nakit'::text, 'kart'::text, 'havale'::text, 'cek'::text, 'diger'::text])));
DROP INDEX IF EXISTS public.payments_statement_discount_id_idx;
ALTER TABLE public.payments DROP COLUMN IF EXISTS statement_discount_id;

-- 6) Tablo (politikalar, tenant tetikleyicisi, indeksler onunla düşer)
DROP TABLE IF EXISTS public.clinic_statement_discounts;

COMMIT;
