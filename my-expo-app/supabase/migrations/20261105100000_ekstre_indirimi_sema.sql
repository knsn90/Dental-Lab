-- 20261105100000_ekstre_indirimi_sema
-- Ekstre indirimi (spec 2026-11-05, plan Görev 2) — şema.
--   • clinic_statement_discounts: klinik ekstresine verilen dönem indirimi (lab başına İND-<doc_no>).
--     Okuma payments ile aynı kapıda: lab = payments_lab_select (finans görme yetkisi) + platform yöneticisi;
--     klinik/hekim = clinic_view_own_receipts sahiplik yüklemi + payments'taki can_view_clinic_billing kapısı.
--     Yazma politikası yok: yazma yalnız SECURITY DEFINER RPC'lerden.
--   • payments.statement_discount_id: indirimin bir faturaya düşen payı = payment_method 'indirim' satırı.
--   • _payments_sd_guard / payments_sd_guard: 'indirim' satırı yalnız siman.sd_write = 'on' (işlem yerel)
--     ya da postgres/service_role ile yazılır, değişir, silinir; fatura silinince zincirleme silme geçer.
--     Yazılan 'indirim' satırı indirimle tutarlı olmalı (lab_id indirimden; fatura lab/klinik/para birimi =
--     indirimin; INSERT'te fatura kesildi|kismi_odendi; Σ pay ≤ indirim) → aksi SD_PAYMENT_MISMATCH.
--   • trg_log_payment_recorded: 'indirim' payı "tahsilat alındı" diye loglanmaz.
--   • v_clinic_balance_ccy / v_clinic_balance: indirimin alacağı (amount − iptal olmayan faturalardaki pay)
--     unallocated_credit'e eklenir; balance ve overdue_net'ten düşer. Mevcut sütunların adı, sırası, tipi
--     aynı; SONA statement_discount_total (Σ indirim; ana parada × rate) eklenir. security_invoker korunur
--     (CREATE OR REPLACE VIEW belirtilmeyen seçenekleri sıfırlar).
-- Geri alma: rollbacks/20261105100000_ekstre_indirimi_sema.down.sql

-- ── İndirim tablosu ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_statement_discounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid NOT NULL REFERENCES public.labs(id),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id),
  currency        text NOT NULL
                    CHECK (currency = ANY (ARRAY['TRY'::text, 'EUR'::text, 'USD'::text, 'GBP'::text, 'IRT'::text])),
  discount_date   date NOT NULL,
  period_from     date NOT NULL,
  period_to       date NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value           numeric(12,4) NOT NULL CHECK (value > 0),
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  base_amount     numeric(12,2) NOT NULL CHECK (base_amount >= 0),  -- indirimin hesaplandığı dönem tutarı (currency)
  rate            numeric NOT NULL DEFAULT 1 CHECK (rate > 0),      -- currency → lab ana para birimi
  amount_base     numeric(12,2) NOT NULL CHECK (amount_base >= 0),
  doc_no          int NOT NULL,                    -- görünüm: İND-<doc_no>
  description     text,
  idempotency_key text,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_statement_discounts_period_check CHECK (period_to >= period_from),
  CONSTRAINT clinic_statement_discounts_percent_check CHECK (kind <> 'percent' OR value <= 100),
  CONSTRAINT clinic_statement_discounts_lab_id_doc_no_key UNIQUE (lab_id, doc_no),
  CONSTRAINT clinic_statement_discounts_lab_id_idempotency_key_key UNIQUE (lab_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS clinic_statement_discounts_lab_clinic_ccy_period_idx
  ON public.clinic_statement_discounts (lab_id, clinic_id, currency, period_from, period_to);

-- Tenant koruması: diğer lab_id tablolarıyla aynı bağlama (ztg_<tablo>_tenant_guard).
DROP TRIGGER IF EXISTS ztg_clinic_statement_discounts_tenant_guard ON public.clinic_statement_discounts;
CREATE TRIGGER ztg_clinic_statement_discounts_tenant_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.clinic_statement_discounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lab_id_tenant();

ALTER TABLE public.clinic_statement_discounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_statement_discounts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.clinic_statement_discounts FROM authenticated;
GRANT SELECT ON public.clinic_statement_discounts TO authenticated;

-- Okuma payments ile aynı kapıda (indirim tutarı finans verisidir; teknisyen/kurye görmez).
-- Lab: payments_lab_select yüklemi + platform yöneticisi.
DROP POLICY IF EXISTS clinic_statement_discounts_lab_select ON public.clinic_statement_discounts;
CREATE POLICY clinic_statement_discounts_lab_select ON public.clinic_statement_discounts
  FOR SELECT TO authenticated
  USING (((lab_id = public.get_my_lab_id()) AND public.lab_can_view_finance()) OR public.is_platform_admin());

-- Klinik / çoklu-lab klinik / hekim: clinic_view_own_receipts sahiplik yüklemi, payments'taki üç klinik
-- politikasının (clinic_view_clinic_payments, clinic_view_multilab_payments, doctor_view_own_clinic_payments)
-- can_view_clinic_billing kapısıyla; satırda clinic_id olduğu için invoices'taki eşleri gibi doğrudan sütunla.
DROP POLICY IF EXISTS clinic_view_own_statement_discounts ON public.clinic_statement_discounts;
CREATE POLICY clinic_view_own_statement_discounts ON public.clinic_statement_discounts
  FOR SELECT TO authenticated
  USING ((clinic_id IS NOT NULL) AND (clinic_id = public.get_my_clinic_id())
         AND public.can_view_clinic_billing(clinic_id));

DROP POLICY IF EXISTS clinic_view_multilab_statement_discounts ON public.clinic_statement_discounts;
CREATE POLICY clinic_view_multilab_statement_discounts ON public.clinic_statement_discounts
  FOR SELECT TO authenticated
  USING ((clinic_id IS NOT NULL) AND (clinic_id IN (SELECT public.my_clinic_ids() AS my_clinic_ids))
         AND public.can_view_clinic_billing(clinic_id));

DROP POLICY IF EXISTS doctor_view_own_clinic_statement_discounts ON public.clinic_statement_discounts;
CREATE POLICY doctor_view_own_clinic_statement_discounts ON public.clinic_statement_discounts
  FOR SELECT TO authenticated
  USING ((clinic_id = public.get_my_clinic_id())
         AND (EXISTS (SELECT 1 FROM public.profiles
                       WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'doctor'::text))))
         AND public.can_view_clinic_billing(clinic_id));

-- ── payments bağı ──────────────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS statement_discount_id uuid NULL
    REFERENCES public.clinic_statement_discounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payments_statement_discount_id_idx
  ON public.payments (statement_discount_id) WHERE statement_discount_id IS NOT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY['nakit'::text, 'kart'::text, 'havale'::text, 'cek'::text, 'diger'::text, 'indirim'::text]));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_sd_consistency;
ALTER TABLE public.payments ADD CONSTRAINT payments_sd_consistency
  CHECK ((payment_method = 'indirim') = (statement_discount_id IS NOT NULL));

-- ── 'indirim' satırlarının koruması ────────────────────────────────────────
-- SECURITY INVOKER bilerek: current_user çağıranı gösterir (DEFINER olsaydı hep postgres olurdu).
-- SECURITY DEFINER RPC'ler ve FK zincirleme silmeleri tablo sahibi (postgres) olarak çalışır → geçer.
-- Doğrudan istemci yazımı (authenticated) yalnız siman.sd_write = 'on' iken geçer.
-- Tutarlılık (INSERT/UPDATE, yeni satır 'indirim'): lab_id indirimden yazılır (auto_set_lab_id JWT'siz
-- NULL bırakır; NULL lab'lı pay lab kullanıcısına görünmez → bakiye çift düşerdi). Bu tetikleyici
-- auto_set_lab_id_payments'tan SONRA, trg_payments_financial_guard'dan ÖNCE çalışır (ad sırası).
-- Σ pay kontrolü tek başına eşzamanlılığa kapalı değildir; yazan RPC klinik başına kilit tutar (Görev 3).
CREATE OR REPLACE FUNCTION public._payments_sd_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sd    boolean := false;
  d       record;
  v_inv   record;
  v_other numeric;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.payment_method = 'indirim' THEN v_sd := true; END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.payment_method = 'indirim' THEN v_sd := true; END IF;
  END IF;

  IF v_sd
     AND coalesce(current_setting('siman.sd_write', true), '') <> 'on'
     AND current_user NOT IN ('postgres', 'service_role') THEN
    -- Fatura silinince zincirleme (ON DELETE CASCADE) silme: fatura artık yok → geçer.
    -- pg_trigger_depth() > 1: yalnız başka bir tetikleyicinin (FK zinciri) içinden; doğrudan
    -- DELETE'te RLS'in gizlediği bir fatura "yok" sayılıp kapı açılmaz.
    IF NOT (TG_OP = 'DELETE' AND pg_trigger_depth() > 1
            AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = OLD.invoice_id)) THEN
      RAISE EXCEPTION 'SD_PAYMENT_LOCKED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  -- 'indirim' satırı indirimle tutarlı mı? (statement_discount_id NULL ise payments_sd_consistency yakalar)
  IF NEW.payment_method = 'indirim' AND NEW.statement_discount_id IS NOT NULL THEN
    SELECT sd.id, sd.lab_id, sd.clinic_id, sd.currency, sd.amount INTO d
      FROM public.clinic_statement_discounts sd WHERE sd.id = NEW.statement_discount_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SD_PAYMENT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    NEW.lab_id := d.lab_id;

    SELECT i.lab_id, i.clinic_id, COALESCE(i.currency, 'TRY') AS currency, i.status INTO v_inv
      FROM public.invoices i WHERE i.id = NEW.invoice_id;
    IF NOT FOUND
       OR v_inv.lab_id IS DISTINCT FROM d.lab_id
       OR v_inv.clinic_id IS DISTINCT FROM d.clinic_id
       OR v_inv.currency IS DISTINCT FROM d.currency
       -- yeni pay yalnız açık faturaya; UPDATE ödenmiş faturada da çalışır (tutar düşünce pay kırpılır)
       OR (TG_OP = 'INSERT' AND v_inv.status NOT IN ('kesildi', 'kismi_odendi')) THEN
      RAISE EXCEPTION 'SD_PAYMENT_MISMATCH' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(sum(p.amount), 0) INTO v_other
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.statement_discount_id = d.id
       AND p.payment_method = 'indirim'
       AND i.status <> 'iptal'
       AND (TG_OP = 'INSERT' OR p.id <> NEW.id);
    IF v_other + NEW.amount > d.amount THEN
      RAISE EXCEPTION 'SD_PAYMENT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._payments_sd_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_sd_guard ON public.payments;
CREATE TRIGGER payments_sd_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._payments_sd_guard();

-- ── Tahsilat logu: indirim payı tahsilat değildir ──────────────────────────
CREATE OR REPLACE FUNCTION public.trg_log_payment_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_method = 'indirim' THEN
    RETURN NEW;   -- ekstre indiriminin faturaya düşen payı: tahsilat logu yazılmaz
  END IF;
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

-- ── Bakiye görünümleri ─────────────────────────────────────────────────────
-- İndirim alacağı = amount − Σ(o indirime bağlı, iptal olmayan faturalardaki payments.amount).
-- Döviz başına: lab + klinik + para birimi eşleşir. statement_discount_total = Σ amount (SONA eklenir;
-- Cari "Tahsil Edilen" = total_paid + unallocated_credit − statement_discount_total).
CREATE OR REPLACE VIEW public.v_clinic_balance_ccy WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) - COALESCE(cr.credit, 0::numeric) - COALESCE(sd.credit, 0::numeric) AS balance,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) AS overdue_amount,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND (i.due_date IS NULL OR i.due_date >= lab_today(i.lab_id))), 0::numeric) AS aging_current,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 1 AND (lab_today(i.lab_id) - i.due_date) <= 30), 0::numeric) AS aging_30,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) >= 31 AND (lab_today(i.lab_id) - i.due_date) <= 60), 0::numeric) AS aging_60,
    COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.paid_amount < i.total AND i.due_date IS NOT NULL AND (lab_today(i.lab_id) - i.due_date) > 60), 0::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total) AS oldest_overdue_date,
    COALESCE(cr.credit, 0::numeric) + COALESCE(sd.credit, 0::numeric) AS unallocated_credit,
    GREATEST(0::numeric, COALESCE(sum(i.total - i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) - COALESCE(cr.credit, 0::numeric) - COALESCE(sd.credit, 0::numeric)) AS overdue_net,
    COALESCE(sd.total, 0::numeric) AS statement_discount_total
   FROM clinics c
     JOIN invoices i ON i.clinic_id = c.id
     LEFT JOIN ( SELECT r.clinic_id,
            r.base_currency,
            sum(r.total_base - r.allocated_base) AS credit
           FROM clinic_receipts r
          GROUP BY r.clinic_id, r.base_currency) cr ON cr.clinic_id = c.id AND cr.base_currency = COALESCE(i.currency, 'TRY'::text)
     LEFT JOIN ( SELECT d.lab_id,
            d.clinic_id,
            d.currency,
            sum(d.amount - COALESCE(dp.pay, 0::numeric)) AS credit,
            sum(d.amount) AS total
           FROM clinic_statement_discounts d
             LEFT JOIN ( SELECT p.statement_discount_id,
                    sum(p.amount) AS pay
                   FROM payments p
                     JOIN invoices pinv ON pinv.id = p.invoice_id
                  WHERE p.statement_discount_id IS NOT NULL AND pinv.status <> 'iptal'::text
                  GROUP BY p.statement_discount_id) dp ON dp.statement_discount_id = d.id
          GROUP BY d.lab_id, d.clinic_id, d.currency) sd ON sd.lab_id = i.lab_id AND sd.clinic_id = c.id AND sd.currency = COALESCE(i.currency, 'TRY'::text)
  GROUP BY c.id, c.name, i.lab_id, (COALESCE(i.currency, 'TRY'::text)), cr.credit, sd.credit, sd.total;

-- Ana para birimi: aynı alacak × d.rate (lab + klinik eşleşir); statement_discount_total = Σ amount × rate.
CREATE OR REPLACE VIEW public.v_clinic_balance WITH (security_invoker = true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric))) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) AS total_paid,
    COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])), 0::numeric) - COALESCE(( SELECT sum(r.total_base - r.allocated_base) AS sum
           FROM clinic_receipts r
          WHERE r.clinic_id = c.id), 0::numeric) - COALESCE(sd.credit_base, 0::numeric) AS balance,
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
          WHERE r.clinic_id = c.id), 0::numeric) + COALESCE(sd.credit_base, 0::numeric) AS unallocated_credit,
    GREATEST(0::numeric, COALESCE(sum((i.total - i.paid_amount) * COALESCE(i.rate_at_time, 1::numeric)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND i.due_date < lab_today(i.lab_id) AND i.paid_amount < i.total), 0::numeric) - COALESCE(( SELECT sum(r.total_base - r.allocated_base) AS sum
           FROM clinic_receipts r
          WHERE r.clinic_id = c.id), 0::numeric) - COALESCE(sd.credit_base, 0::numeric)) AS overdue_net,
    COALESCE(sd.total_base, 0::numeric) AS statement_discount_total
   FROM clinics c
     LEFT JOIN invoices i ON i.clinic_id = c.id
     LEFT JOIN ( SELECT d.lab_id,
            d.clinic_id,
            sum((d.amount - COALESCE(dp.pay, 0::numeric)) * d.rate) AS credit_base,
            sum(d.amount * d.rate) AS total_base
           FROM clinic_statement_discounts d
             LEFT JOIN ( SELECT p.statement_discount_id,
                    sum(p.amount) AS pay
                   FROM payments p
                     JOIN invoices pinv ON pinv.id = p.invoice_id
                  WHERE p.statement_discount_id IS NOT NULL AND pinv.status <> 'iptal'::text
                  GROUP BY p.statement_discount_id) dp ON dp.statement_discount_id = d.id
          GROUP BY d.lab_id, d.clinic_id) sd ON sd.lab_id = i.lab_id AND sd.clinic_id = c.id
  GROUP BY c.id, c.name, i.lab_id, sd.credit_base, sd.total_base;
