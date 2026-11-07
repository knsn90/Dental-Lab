-- 20261107102000_dz_iptal_ve_tavan — DZ son düzeltmeleri (plan 1, final review F1 + F2).
--   F1: record_correction_document tavanı = kalemin fatura toplamındaki payı
--       round(net_total × invoices.total / Σ net_total, 2) − aynı kalemdeki önceki DZ; ayrıca Σ DZ ≤ invoices.total.
--   F2: faturası iptal olan DZ "boş" sayılır — etkin tutar tek yardımcıdan (v_statement_discount_effective):
--       _sd_apply_credit, _sd_quote, finance_period_metrics, profitability_summary, profitability_revenue_ccy,
--       _profit_revenue_lines, v_clinic_balance(_ccy), v_monthly_finance_summary(_ccy) tabloyu değil yardımcıyı okur.
--   İND davranışı değişmez (İND için etkin = nominal). İmzalar, SECURITY, search_path, ACL ve görünüm
--   sütunları/seçenekleri/yetkileri aynı kalır (CREATE OR REPLACE). Fatura kilidi kaçışı KULLANILMAZ.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- === Yardımcı ===
-- Tek kural (F2): clinic_statement_discounts satırının ETKİN tutarı.
--   * İND ya da faturası iptal OLMAYAN DZ: amount / amount_base aynen.
--   * Faturası iptal DZ ("boş" DZ): yalnız iptal olmayan BAŞKA faturalara zaten uygulanmış payları
--     (Σ payments.amount, statement_discount_id = dz.id, faturası iptal değil). Yeni alacak doğmaz.
--     amount_base = round(etkin tutar × d.rate, 2) — DZ satırının amount_base = round(amount × rate, 2)
--     kuralı ve _sd_apply_credit'in pay kuru (r_sd.rate) ile aynı.
-- security_invoker: okuyan kendi RLS'iyle görür (DZ, payları ve faturası aynı klinikte → lab ve klinik aynı sonucu alır).
CREATE VIEW public.v_statement_discount_effective WITH (security_invoker = true) AS
SELECT d.id, d.lab_id, d.clinic_id, d.currency, d.doc_type, d.doc_no, d.invoice_id, d.invoice_item_id,
       d.discount_date, d.period_from, d.period_to, d.created_at, d.rate,
       d.amount      AS nominal_amount,
       d.amount_base AS nominal_amount_base,
       v.is_void,
       CASE WHEN v.is_void THEN COALESCE(sh.amt, 0) ELSE d.amount END AS amount,
       CASE WHEN v.is_void THEN round(COALESCE(sh.amt, 0) * d.rate, 2) ELSE d.amount_base END AS amount_base
  FROM clinic_statement_discounts d
  LEFT JOIN invoices di ON di.id = d.invoice_id
  CROSS JOIN LATERAL (SELECT (d.doc_type = 'DZ' AND COALESCE(di.status = 'iptal', false)) AS is_void) v
  LEFT JOIN LATERAL (
    SELECT sum(p.amount) AS amt
      FROM payments p
      JOIN invoices pinv ON pinv.id = p.invoice_id
     WHERE v.is_void AND p.statement_discount_id = d.id AND pinv.status <> 'iptal') sh ON true;

REVOKE ALL ON TABLE public.v_statement_discount_effective FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_statement_discount_effective TO authenticated;
GRANT ALL ON TABLE public.v_statement_discount_effective TO service_role;

-- === Görünümler ===
CREATE OR REPLACE VIEW public.v_clinic_balance WITH (security_invoker=true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(COALESCE(i.amount_base, (i.total * COALESCE(i.rate_at_time, (1)::numeric)))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum((i.paid_amount * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    ((COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric)) - COALESCE(sd.credit_base, (0)::numeric)) AS balance,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= lab_today(i.lab_id))))), (0)::numeric) AS aging_current,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) >= 1) AND ((lab_today(i.lab_id) - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) >= 31) AND ((lab_today(i.lab_id) - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
        CASE
            WHEN (count(DISTINCT i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))) = 1) THEN max(i.currency) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency <> 'TRY'::text)))
            ELSE NULL::text
        END AS currency,
    COALESCE(sum(i.total) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_billed_original,
    COALESCE(sum(i.paid_amount) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS total_paid_original,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.currency IS NOT NULL) AND (i.currency <> 'TRY'::text))), (0)::numeric) AS balance_original,
    (COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric) + COALESCE(sd.credit_base, (0)::numeric)) AS unallocated_credit,
    GREATEST((0)::numeric, ((COALESCE(sum(((i.total - i.paid_amount) * COALESCE(i.rate_at_time, (1)::numeric))) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) - COALESCE(( SELECT sum((r.total_base - r.allocated_base)) AS sum
           FROM clinic_receipts r
          WHERE (r.clinic_id = c.id)), (0)::numeric)) - COALESCE(sd.credit_base, (0)::numeric))) AS overdue_net,
    COALESCE(sd.total_base, (0)::numeric) AS statement_discount_total
   FROM ((clinics c
     LEFT JOIN invoices i ON ((i.clinic_id = c.id)))
     LEFT JOIN ( SELECT d.lab_id,
            d.clinic_id,
            sum(((d.amount - COALESCE(dp.pay, (0)::numeric)) * d.rate)) AS credit_base,
            sum((d.amount * d.rate)) AS total_base
           FROM (v_statement_discount_effective d
             LEFT JOIN ( SELECT p.statement_discount_id,
                    sum(p.amount) AS pay
                   FROM (payments p
                     JOIN invoices pinv ON ((pinv.id = p.invoice_id)))
                  WHERE ((p.statement_discount_id IS NOT NULL) AND (pinv.status <> 'iptal'::text))
                  GROUP BY p.statement_discount_id) dp ON ((dp.statement_discount_id = d.id)))
          GROUP BY d.lab_id, d.clinic_id) sd ON (((sd.lab_id = i.lab_id) AND (sd.clinic_id = c.id))))
  GROUP BY c.id, c.name, i.lab_id, sd.credit_base, sd.total_base;

CREATE OR REPLACE VIEW public.v_clinic_balance_ccy WITH (security_invoker=true) AS
 SELECT c.id AS clinic_id,
    c.name AS clinic_name,
    i.lab_id,
    COALESCE(i.currency, 'TRY'::text) AS currency,
    count(DISTINCT i.id) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))) AS invoice_count,
    COALESCE(sum(i.total) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_billed,
    COALESCE(sum(i.paid_amount) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) AS total_paid,
    ((COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))), (0)::numeric) - COALESCE(cr.credit, (0)::numeric)) - COALESCE(sd.credit, (0)::numeric)) AS balance,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) AS overdue_amount,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND ((i.due_date IS NULL) OR (i.due_date >= lab_today(i.lab_id))))), (0)::numeric) AS aging_current,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) >= 1) AND ((lab_today(i.lab_id) - i.due_date) <= 30))), (0)::numeric) AS aging_30,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) >= 31) AND ((lab_today(i.lab_id) - i.due_date) <= 60))), (0)::numeric) AS aging_60,
    COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.paid_amount < i.total) AND (i.due_date IS NOT NULL) AND ((lab_today(i.lab_id) - i.due_date) > 60))), (0)::numeric) AS aging_90,
    min(i.due_date) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))) AS oldest_overdue_date,
    (COALESCE(cr.credit, (0)::numeric) + COALESCE(sd.credit, (0)::numeric)) AS unallocated_credit,
    GREATEST((0)::numeric, ((COALESCE(sum((i.total - i.paid_amount)) FILTER (WHERE ((i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])) AND (i.due_date < lab_today(i.lab_id)) AND (i.paid_amount < i.total))), (0)::numeric) - COALESCE(cr.credit, (0)::numeric)) - COALESCE(sd.credit, (0)::numeric))) AS overdue_net,
    COALESCE(sd.total, (0)::numeric) AS statement_discount_total
   FROM (((clinics c
     JOIN invoices i ON ((i.clinic_id = c.id)))
     LEFT JOIN ( SELECT r.clinic_id,
            r.base_currency,
            sum((r.total_base - r.allocated_base)) AS credit
           FROM clinic_receipts r
          GROUP BY r.clinic_id, r.base_currency) cr ON (((cr.clinic_id = c.id) AND (cr.base_currency = COALESCE(i.currency, 'TRY'::text)))))
     LEFT JOIN ( SELECT d.lab_id,
            d.clinic_id,
            d.currency,
            sum((d.amount - COALESCE(dp.pay, (0)::numeric))) AS credit,
            sum(d.amount) AS total
           FROM (v_statement_discount_effective d
             LEFT JOIN ( SELECT p.statement_discount_id,
                    sum(p.amount) AS pay
                   FROM (payments p
                     JOIN invoices pinv ON ((pinv.id = p.invoice_id)))
                  WHERE ((p.statement_discount_id IS NOT NULL) AND (pinv.status <> 'iptal'::text))
                  GROUP BY p.statement_discount_id) dp ON ((dp.statement_discount_id = d.id)))
          GROUP BY d.lab_id, d.clinic_id, d.currency) sd ON (((sd.lab_id = i.lab_id) AND (sd.clinic_id = c.id) AND (sd.currency = COALESCE(i.currency, 'TRY'::text)))))
  GROUP BY c.id, c.name, i.lab_id, COALESCE(i.currency, 'TRY'::text), cr.credit, sd.credit, sd.total;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary WITH (security_invoker=on) AS
 SELECT month,
    sum(income) AS income,
    sum(expense) AS expense,
    (sum(income) - sum(expense)) AS profit
   FROM ( SELECT (date_trunc('month'::text, (i.issue_date)::timestamp with time zone))::date AS month,
            COALESCE(i.amount_base, (i.total * COALESCE(i.rate_at_time, (1)::numeric))) AS income,
            0 AS expense
           FROM invoices i
          WHERE ((i.lab_id = get_my_lab_id()) AND (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])))
        UNION ALL
         SELECT (date_trunc('month'::text, (e.expense_date)::timestamp with time zone))::date AS date_trunc,
            0,
            fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date) AS fn_to_base
           FROM expenses e
          WHERE (e.lab_id = get_my_lab_id())
        UNION ALL
         SELECT (date_trunc('month'::text, (d.discount_date)::timestamp with time zone))::date AS month,
            (- d.amount_base) AS income,
            0 AS expense
           FROM v_statement_discount_effective d
          WHERE (d.lab_id = get_my_lab_id())) sub
  GROUP BY month
  ORDER BY month DESC;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy WITH (security_invoker=on) AS
 SELECT month,
    currency,
    sum(income) AS income,
    sum(expense) AS expense,
    (sum(income) - sum(expense)) AS profit
   FROM ( SELECT (date_trunc('month'::text, (invoices.issue_date)::timestamp with time zone))::date AS month,
            COALESCE(invoices.currency, 'TRY'::text) AS currency,
            invoices.total AS income,
            0 AS expense
           FROM invoices
          WHERE ((invoices.lab_id = get_my_lab_id()) AND (invoices.status <> ALL (ARRAY['iptal'::text, 'taslak'::text])))
        UNION ALL
         SELECT (date_trunc('month'::text, (expenses.expense_date)::timestamp with time zone))::date AS month,
            COALESCE(expenses.currency, 'TRY'::text) AS currency,
            0 AS income,
            expenses.amount AS expense
           FROM expenses
          WHERE (expenses.lab_id = get_my_lab_id())
        UNION ALL
         SELECT (date_trunc('month'::text, (d.discount_date)::timestamp with time zone))::date AS month,
            d.currency,
            (- d.amount) AS income,
            0 AS expense
           FROM v_statement_discount_effective d
          WHERE (d.lab_id = get_my_lab_id())) sub
  GROUP BY month, currency
  ORDER BY month DESC, currency;

-- === Fonksiyonlar ===
CREATE OR REPLACE FUNCTION public._sd_apply_credit(p_lab uuid, p_clinic uuid, p_currency text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_sd      record;
  inv       record;
  r_st      record;
  v_credit  numeric;
  v_open    numeric;
  v_take    numeric;
  v_applied numeric := 0;
  v_prior   text;
  v_base    text;
BEGIN
  IF p_lab IS NULL OR p_clinic IS NULL OR p_currency IS NULL THEN
    RETURN 0;
  END IF;

  -- Klinik kilidi: Σ pay okunmadan önce (eşzamanlı yazanlar sıraya girer)
  PERFORM pg_advisory_xact_lock(hashtext('sd:' || p_clinic));

  -- Uygulanacak alacak yoksa ucuz çıkış
  IF NOT EXISTS (
       SELECT 1 FROM v_statement_discount_effective sd
        WHERE sd.lab_id = p_lab AND sd.clinic_id = p_clinic AND sd.currency = p_currency
          AND sd.amount > (SELECT COALESCE(sum(p.amount), 0)
                             FROM payments p
                             JOIN invoices i ON i.id = p.invoice_id
                            WHERE p.statement_discount_id = sd.id AND i.status <> 'iptal')) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(ls.default_currency, 'TRY') INTO v_base FROM lab_settings ls WHERE ls.lab_id = p_lab;
  v_base := COALESCE(v_base, 'TRY');

  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);

  -- Toplamı artmış 'odendi' faturayı mevcut kuralla yeniden aç (kismi_odendi / kesildi)
  FOR r_st IN
    SELECT i.id
      FROM invoices i
     WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
       AND i.status = 'odendi' AND i.total > i.paid_amount
     ORDER BY i.id
     FOR UPDATE
  LOOP
    PERFORM recalc_invoice_payment_state(r_st.id);
  END LOOP;

  FOR r_sd IN
    SELECT sd.id, sd.amount, sd.rate, sd.doc_no, sd.doc_type
      FROM v_statement_discount_effective sd
     WHERE sd.lab_id = p_lab AND sd.clinic_id = p_clinic AND sd.currency = p_currency
     ORDER BY sd.discount_date, sd.created_at, sd.doc_no
  LOOP
    SELECT r_sd.amount - COALESCE(sum(p.amount), 0) INTO v_credit
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
     WHERE p.statement_discount_id = r_sd.id AND i.status <> 'iptal';
    CONTINUE WHEN v_credit <= 0;

    FOR inv IN
      SELECT i.id, i.total, i.paid_amount, i.currency
        FROM invoices i
       WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
         AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount
       ORDER BY i.due_date ASC NULLS LAST, i.created_at, i.id
       FOR UPDATE
    LOOP
      EXIT WHEN v_credit <= 0;
      SELECT inv.total - COALESCE(sum(p.amount), 0) INTO v_open FROM payments p WHERE p.invoice_id = inv.id;
      v_open := LEAST(v_open, inv.total - inv.paid_amount);
      CONTINUE WHEN v_open <= 0;
      v_take := LEAST(v_open, v_credit);

      INSERT INTO payments (lab_id, invoice_id, amount, payment_date, payment_method,
                            currency, rate_at_time, amount_base, base_currency_at_time,
                            receipt_id, received_by, statement_discount_id, notes)
      VALUES (p_lab, inv.id, v_take, lab_today(p_lab), 'indirim',
              inv.currency, r_sd.rate, round(v_take * r_sd.rate, 2), v_base,
              NULL, auth.uid(), r_sd.id,
              CASE WHEN r_sd.doc_type = 'DZ' THEN 'DZ-' ELSE 'İND-' END || r_sd.doc_no);

      v_credit  := v_credit - v_take;
      v_applied := v_applied + v_take;
    END LOOP;
  END LOOP;

  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);
  RETURN v_applied;
END
$function$
;

CREATE OR REPLACE FUNCTION public._sd_quote(p_lab uuid, p_clinic uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period numeric := 0;
  v_prior  numeric := 0;
  v_base   numeric;
  v_amount numeric;
  v_open   numeric := 0;
  v_to_inv numeric := 0;
  v_err    text;
BEGIN
  -- Dönem toplamı: dönemde kesilmiş (taslak/iptal dışı) faturalar, aynı para birimi
  SELECT COALESCE(sum(i.total), 0) INTO v_period
    FROM invoices i
   WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
     AND i.issue_date BETWEEN p_from AND p_to
     AND i.status IN ('kesildi', 'kismi_odendi', 'odendi');

  -- Önceki indirimler: aynı lab + klinik + para biriminde dönemi [p_from, p_to] ile ÇAKIŞAN
  SELECT COALESCE(sum(d.amount), 0) INTO v_prior
    FROM v_statement_discount_effective d
   WHERE d.lab_id = p_lab AND d.clinic_id = p_clinic AND d.currency = p_currency
     AND d.period_from <= p_to AND d.period_to >= p_from;

  v_base := v_period - v_prior;

  IF v_period <= 0 THEN
    v_err := 'SD_EMPTY';
  ELSIF p_value IS NULL OR p_value <= 0 OR p_kind IS NULL OR p_kind NOT IN ('percent', 'fixed') THEN
    v_err := 'SD_VALUE';
  ELSIF p_kind = 'percent' AND p_value > 100 THEN
    v_err := 'SD_CAP';
  ELSE
    v_amount := CASE WHEN p_kind = 'percent' THEN ROUND(v_base * p_value / 100, 2)
                     ELSE ROUND(p_value, 2) END;
    IF v_base <= 0 OR v_amount > v_base THEN
      v_err := 'SD_CAP';                 -- dayanak kalmadı / dayanağı aşıyor
    ELSIF v_amount <= 0 THEN
      v_err := 'SD_VALUE';               -- yüzde kuruşa yuvarlanınca 0
    END IF;
  END IF;

  IF v_err IS NULL THEN
    -- Dönemdeki açık faturalara sığan kısım (dağıtımla aynı süzgeç)
    SELECT COALESCE(sum(i.total - i.paid_amount), 0) INTO v_open
      FROM invoices i
     WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
       AND i.issue_date BETWEEN p_from AND p_to
       AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount;
    v_to_inv := LEAST(v_amount, v_open);
  END IF;

  RETURN jsonb_build_object(
    'ok',              v_err IS NULL,
    'error',           v_err,
    'period_total',    v_period,
    'prior_discounts', v_prior,
    'base',            v_base,
    'amount',          COALESCE(v_amount, 0),
    'to_invoices',     CASE WHEN v_err IS NULL THEN v_to_inv ELSE 0 END,
    'to_credit',       CASE WHEN v_err IS NULL THEN v_amount - v_to_inv ELSE 0 END);
END
$function$
;

CREATE OR REPLACE FUNCTION public.finance_period_metrics(p_from date, p_to date)
 RETURNS TABLE(currency text, revenue numeric, invoice_count integer, collections numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with lab as (
    select public.get_my_lab_id() as id where public.lab_can_view_finance()
  ), rev as (
    select coalesce(i.currency, 'TRY') as ccy, sum(i.total) as amt, count(*)::int as n
      from public.invoices i join lab on i.lab_id = lab.id
     where i.status in ('kesildi', 'kismi_odendi', 'odendi') and i.issue_date between p_from and p_to
     group by 1
  ), disc as (
    -- 20261105102000: ekstre indirimi ciroyu indirim gününde, kendi para biriminde düşürür
    select d.currency as ccy, sum(d.amount) as amt
      from public.v_statement_discount_effective d join lab on d.lab_id = lab.id
     where d.discount_date between p_from and p_to
     group by 1
  ), col as (
    select x.ccy, sum(x.amt) as amt from (
      -- makbuz satırları, makbuz gününde
      select coalesce(l.currency, r.base_currency, 'TRY') as ccy, l.amount as amt
        from public.clinic_receipt_lines l
        join public.clinic_receipts r on r.id = l.receipt_id
        join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
      union all
      -- satırı olmayan makbuz: ana para biriminde toplam
      select coalesce(r.base_currency, 'TRY'), r.total_base
        from public.clinic_receipts r join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
         and not exists (select 1 from public.clinic_receipt_lines l where l.receipt_id = r.id)
      union all
      -- makbuza bağlı olmayan doğrudan ödemeler (makbuzdan dağıtılan ödemeler zaten makbuzda sayıldı);
      -- 20261105102000: ekstre indirimi payları ('indirim') tahsilat değildir
      select coalesce(p.currency, 'TRY'), p.amount
        from public.payments p join lab on p.lab_id = lab.id
       where p.receipt_id is null and p.payment_date between p_from and p_to
         and p.payment_method <> 'indirim'
    ) x group by x.ccy
  )
  select coalesce(rev.ccy, disc.ccy, col.ccy), coalesce(rev.amt, 0) - coalesce(disc.amt, 0),
         coalesce(rev.n, 0), coalesce(col.amt, 0)
    from rev
    full join disc on disc.ccy = rev.ccy
    full join col on col.ccy = coalesce(rev.ccy, disc.ccy)
$function$
;

CREATE OR REPLACE FUNCTION public.profitability_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(currency text, revenue numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20261026150000: dönem = FATURA tarihi; kesilmiş faturaların TAMAMI (toplu ve siparişsiz dahil) →
  -- finance_period_metrics.revenue ile aynı rakam.
  -- 20261101120000: KDV HARİÇ (subtotal) — artık finance_period_metrics'ten KDV kadar düşük; yalnız Karlılık okur.
  -- 20261105102000: ekstre indirimi kendi dövizinde, indirim gününde düşülür (profitability_by_service toplamı = bu).
  SELECT x.currency, SUM(x.revenue) AS revenue
  FROM (
    SELECT COALESCE(i.currency, 'TRY') AS currency, i.subtotal AS revenue
      FROM invoices i
     WHERE i.lab_id = p_lab_id
       AND public.can_view_lab_profit(p_lab_id)
       AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT d.currency, -d.amount
      FROM v_statement_discount_effective d
     WHERE d.lab_id = p_lab_id
       AND public.can_view_lab_profit(p_lab_id)
       AND d.discount_date BETWEEN p_from AND p_to
  ) x
  GROUP BY x.currency
  ORDER BY 1;
$function$
;

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cur text; v_orig numeric; v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi (tek tanım). Gelir = dönemde kesilen faturalar (saklı kurla
  -- ana para birimi), malzeme = o faturalara bağlı siparişlerin tüketimi; işçilik/genel gider dönem gideri.
  -- 20261101120000: gelir KDV HARİÇ (subtotal); kur = rate_at_time, yoksa amount_base/total, o da yoksa 1.
  -- 20261105102000: ekstre indirimi geliri indirim gününde düşürür — ana parada amount_base, orijinal
  -- dövizde amount (KDV ayrılmaz: indirimin tamamı). Tek döviz kararı indirimlerin dövizini de sayar.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT x.currency)=1 AND max(x.currency)<>'TRY' THEN max(x.currency) END, sum(x.amt)
    INTO v_cur, v_orig
  FROM (
    SELECT i.currency, i.subtotal AS amt
      FROM invoices i
     WHERE i.lab_id=p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi') AND i.issue_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT d.currency, -d.amount
      FROM v_statement_discount_effective d
     WHERE d.lab_id=p_lab_id AND d.discount_date BETWEEN p_from AND p_to
  ) x;
  v_labor :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, sp.gross_amount, sp.currency, sp.payment_date)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel' AND e.salary_payment_id IS NULL AND e.advance_id IS NULL
                AND e.expense_date BETWEEN p_from AND p_to),0);
  v_overhead :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.expense_date BETWEEN p_from AND p_to AND e.category NOT IN ('malzeme','personel')),0);
  RETURN QUERY
  WITH per_inv AS (   -- dönemde KESİLEN faturalar (tek tanım: taslak/iptal hariç, fatura tarihi)
    SELECT i.id, i.work_order_id, i.total, i.currency,
           i.subtotal * COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1) AS base
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), per_wo AS (  -- o faturalara bağlı siparişler (doğrudan bağ + toplu fatura bağları)
    SELECT pi2.work_order_id AS wo_id FROM per_inv pi2 WHERE pi2.work_order_id IS NOT NULL
    UNION
    SELECT io.work_order_id FROM invoice_orders io JOIN per_inv pi3 ON pi3.id = io.invoice_id
  ), op AS (
    SELECT COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo JOIN per_wo ON per_wo.wo_id = wo.id
    WHERE wo.lab_id=p_lab_id
  ), disc AS (  -- dönemde (indirim günü) girilen ekstre indirimleri, ana para birimi
    SELECT COALESCE(SUM(d.amount_base),0) AS base
      FROM v_statement_discount_effective d
     WHERE d.lab_id = p_lab_id AND d.discount_date BETWEEN p_from AND p_to
  ), agg AS (
    SELECT (SELECT COUNT(*) FROM per_wo)::bigint AS cnt,
           (SELECT COALESCE(SUM(base),0) FROM per_inv) - (SELECT disc.base FROM disc) AS rev,
           (SELECT COALESCE(SUM(material),0) FROM op) AS mat
  )
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead,
    agg.mat + v_labor + v_overhead, agg.rev - (agg.mat + v_labor + v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev - (agg.mat + v_labor + v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._profit_revenue_lines(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(invoice_id uuid, clinic_id uuid, doctor_id uuid, order_ids uuid[], row_kind text, service_id uuid, unit text, currency text, quantity numeric, revenue numeric, revenue_base numeric, has_list boolean, list_value_base numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT COALESCE((SELECT default_currency FROM lab_settings WHERE lab_id = p_lab_id), 'TRY') AS ccy
  ), inv AS (   -- dönemde KESİLEN faturalar (profitability_summary ile aynı seçim ve kur)
    SELECT i.id, i.clinic_id, i.doctor_id AS inv_doctor, i.work_order_id, i.issue_date,
           COALESCE(i.currency, 'TRY') AS currency, i.subtotal, COALESCE(i.discount_amount, 0) AS discount_amount,
           COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1) AS rate
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), inv_orders AS (   -- faturaya bağlı siparişler: doğrudan bağ + toplu fatura bağı
    SELECT inv.id AS inv_id, inv.work_order_id AS wo_id FROM inv WHERE inv.work_order_id IS NOT NULL
    UNION
    SELECT io.invoice_id, io.work_order_id FROM invoice_orders io JOIN inv ON inv.id = io.invoice_id
  ), inv_x AS (   -- sipariş listesi + kalemden bulunamayan hekim için fatura düzeyi yedek
    SELECT inv.*, COALESCE(ol.wo_ids, '{}'::uuid[]) AS wo_ids,
           CASE COALESCE(cardinality(ol.wo_ids), 0)
             WHEN 0 THEN inv.inv_doctor
             WHEN 1 THEN (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = ol.wo_ids[1])
           END AS fallback_doctor   -- çok siparişli toplu faturada invoices.doctor_id KULLANILMAZ (ilk siparişin hekimi)
      FROM inv
      LEFT JOIN LATERAL (SELECT array_agg(o.wo_id ORDER BY o.wo_id) AS wo_ids FROM inv_orders o WHERE o.inv_id = inv.id) ol ON true
  ), items AS (
    SELECT ix.id AS inv_id, ix.clinic_id, ix.currency, ix.rate, ix.issue_date, ix.wo_ids, ix.fallback_doctor,
           ii.quantity,
           -- 20261105110000: fatura altı indirim kalemlere net payları oranında (yuvarlamasız) dağılır →
           -- kalem toplamı = subtotal, "Kalemsiz fatura" farkı indirimden doğmaz. İndirimsiz faturada aynen.
           CASE WHEN ix.discount_amount > 0
                THEN COALESCE(ii.net_total, ii.total, 0)
                     * (1 - COALESCE(ix.discount_amount
                                     / NULLIF(SUM(COALESCE(ii.net_total, ii.total, 0)) OVER (PARTITION BY ix.id), 0), 0))
                ELSE COALESCE(ii.net_total, ii.total, 0) END AS amount,
           -- sipariş: kalemin sipariş kalemi → yoksa açıklamanın "[sipariş no]" öneki (yalnız bu faturanın siparişleri)
           COALESCE(oi.work_order_id,
             (SELECT wo.id FROM work_orders wo
               WHERE wo.id = ANY (ix.wo_ids)
                 AND wo.order_number = btrim(substring(ii.description from '^\s*\[([^\]]*)\]'))
               ORDER BY wo.id LIMIT 1)) AS item_wo,
           oi.service_id AS oi_service,
           -- eşleşme adı: sipariş kalemi adı; bağsız kalemde açıklamanın "[sipariş no]" öneki atılmış hâli
           lower(btrim(COALESCE(oi.name, regexp_replace(ii.description, '^\s*\[[^\]]*\]\s*', '')))) AS match_name
      FROM inv_x ix
      JOIN invoice_items ii ON ii.invoice_id = ix.id
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id
  ), item_lines AS (
    SELECT it.inv_id, it.clinic_id,
           CASE WHEN it.item_wo IS NOT NULL THEN (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = it.item_wo)
                ELSE it.fallback_doctor END AS doctor_id,
           -- siparişsiz kalem çok siparişli faturada sipariş SAHİPLENMEZ (siparişler kendi hekiminde sayılsın)
           CASE WHEN it.item_wo IS NOT NULL THEN ARRAY[it.item_wo]
                WHEN cardinality(it.wo_ids) <= 1 THEN it.wo_ids ELSE '{}'::uuid[] END AS order_ids,
           CASE WHEN s.id IS NOT NULL THEN 'service' ELSE 'other' END AS row_kind,
           s.id AS service_id, s.unit, it.currency, it.quantity, it.amount AS revenue, it.amount * it.rate AS revenue_base,
           lr.lrate,
           (s.id IS NOT NULL AND COALESCE(s.price, 0) > 0 AND lr.lrate IS NOT NULL) AS has_list,
           CASE WHEN s.id IS NOT NULL AND COALESCE(s.price, 0) > 0 AND lr.lrate IS NOT NULL
                THEN it.quantity * s.price * lr.lrate * it.rate ELSE 0 END AS list_value_base
      FROM items it
      LEFT JOIN LATERAL (   -- işlem eşleşmesi: service_id → aynı labda tam ad (büyük/küçük harf duyarsız) → Diğer
        SELECT s0.id, s0.unit, s0.price, s0.currency FROM (
          SELECT ls.id, ls.unit, ls.price, ls.currency, 0 AS pri, true AS act, ls.created_at
            FROM lab_services ls WHERE it.oi_service IS NOT NULL AND ls.id = it.oi_service AND ls.lab_id = p_lab_id
          UNION ALL
          SELECT ls.id, ls.unit, ls.price, ls.currency, 1, COALESCE(ls.is_active, true), ls.created_at
            FROM lab_services ls WHERE ls.lab_id = p_lab_id AND it.match_name <> '' AND lower(btrim(ls.name)) = it.match_name
        ) s0 ORDER BY s0.pri, s0.act DESC, s0.created_at NULLS LAST, s0.id LIMIT 1
      ) s ON true
      -- liste fiyatı → faturanın dövizi (fatura tarihindeki kur); sonra faturanın kuruyla ana para birimi
      LEFT JOIN LATERAL (
        SELECT public.get_currency_rate(p_lab_id, COALESCE(s.currency, (SELECT ccy FROM base)), it.currency, it.issue_date) AS lrate
         WHERE s.id IS NOT NULL AND COALESCE(s.price, 0) > 0
      ) lr ON true
  ), remainder AS (   -- kalem toplamı subtotal'den farklıysa ya da fatura kalemsizse fark: "Kalemsiz fatura"
    SELECT ix.id AS inv_id, ix.clinic_id, ix.fallback_doctor AS doctor_id,
           CASE WHEN cardinality(ix.wo_ids) <= 1 THEN ix.wo_ids ELSE '{}'::uuid[] END AS order_ids, 'no_items'::text AS row_kind,
           NULL::uuid AS service_id, NULL::text AS unit, ix.currency, 0::numeric AS quantity,
           ix.subtotal - COALESCE(t.amt, 0) AS revenue, (ix.subtotal - COALESCE(t.amt, 0)) * ix.rate AS revenue_base,
           NULL::numeric AS lrate, false AS has_list, 0::numeric AS list_value_base
      FROM inv_x ix
      LEFT JOIN (SELECT il.inv_id, SUM(il.revenue) AS amt, count(*) AS n FROM item_lines il GROUP BY il.inv_id) t ON t.inv_id = ix.id
     WHERE t.n IS NULL OR abs(ix.subtotal - t.amt) > 0.005
  ), all_lines AS (
    SELECT * FROM item_lines UNION ALL SELECT * FROM remainder
  ), uncovered AS (   -- faturaya bağlı ama hiçbir satırda görünmeyen sipariş → 0 tutarlı satır (sipariş sayısı tutsun)
    SELECT o.inv_id, ix.clinic_id, (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = o.wo_id) AS doctor_id,
           ARRAY[o.wo_id] AS order_ids, 'no_items'::text AS row_kind, NULL::uuid AS service_id, NULL::text AS unit,
           ix.currency, 0::numeric AS quantity, 0::numeric AS revenue, 0::numeric AS revenue_base,
           NULL::numeric AS lrate, false AS has_list, 0::numeric AS list_value_base
      FROM inv_orders o JOIN inv_x ix ON ix.id = o.inv_id
     WHERE NOT EXISTS (SELECT 1 FROM all_lines l WHERE l.inv_id = o.inv_id AND o.wo_id = ANY (l.order_ids))
  )
  SELECT l.inv_id, l.clinic_id, l.doctor_id, l.order_ids, l.row_kind, l.service_id, l.unit, l.currency,
         l.quantity, l.revenue, l.revenue_base, l.has_list, l.list_value_base
    FROM (SELECT * FROM all_lines UNION ALL SELECT * FROM uncovered) l
  UNION ALL
  -- 20261105102000: ekstre indirimi — hizmete/hekime/siparişe dağıtılamaz; kliniğin eksi satırı, indirim gününde
  -- (kendi dövizinde amount, ana parada amount_base). Kırılım toplamı dönem cirosuna eşit kalır.
  SELECT NULL::uuid, d.clinic_id, NULL::uuid, '{}'::uuid[], 'statement_discount'::text, NULL::uuid, NULL::text,
         d.currency, 0::numeric, -d.amount, -d.amount_base, false, 0::numeric
    FROM v_statement_discount_effective d
   WHERE d.lab_id = p_lab_id AND d.discount_date BETWEEN p_from AND p_to;
$function$
;

CREATE OR REPLACE FUNCTION public.record_correction_document(p_invoice_item_id uuid, p_amount numeric, p_doc_date date, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason  text := btrim(COALESCE(p_reason, ''));
  v_key     text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_amount  numeric;
  v_inv_id  uuid;
  v_clinic  uuid;
  v_lab     uuid;
  v_inv     record;
  v_net     numeric;
  v_used    numeric;
  v_share   numeric;
  v_used_inv numeric;
  v_date    date;
  v_rate    numeric;
  v_base    text;
  v_doc     int;
  v_id      uuid;
  v_k       record;
  v_open    numeric;
  v_to_inv  numeric := 0;
  v_prior   text;
BEGIN
  -- 1) Doğrulama: gerekçe, tutar (kuruşa yuvarlanır), anahtar (boş → yok)
  IF v_reason = '' THEN RAISE EXCEPTION 'DZ_REASON'; END IF;
  v_amount := ROUND(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'DZ_VALUE'; END IF;

  -- 2) Kalem → fatura → klinik → lab zinciri ve yetki kapısı (v_lab = clinics.lab_id)
  SELECT it.invoice_id INTO v_inv_id FROM invoice_items it WHERE it.id = p_invoice_item_id;
  IF v_inv_id IS NULL THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;
  SELECT i.clinic_id INTO v_clinic FROM invoices i WHERE i.id = v_inv_id;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = v_clinic;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- 3) İdempotency (kilitten önce): aynı lab + anahtar, aynı parametreler → eski sonuç; farklı → çakışma
  IF v_key IS NOT NULL THEN
    SELECT d.id, d.doc_type, d.invoice_item_id, d.amount, d.description, d.discount_date
      INTO v_k FROM clinic_statement_discounts d
     WHERE d.lab_id = v_lab AND d.idempotency_key = v_key;
    IF v_k.id IS NOT NULL THEN
      IF v_k.doc_type IS DISTINCT FROM 'DZ' OR v_k.invoice_item_id IS DISTINCT FROM p_invoice_item_id
         OR v_k.amount IS DISTINCT FROM v_amount OR v_k.description IS DISTINCT FROM v_reason
         OR (p_doc_date IS NOT NULL AND v_k.discount_date IS DISTINCT FROM p_doc_date) THEN
        RAISE EXCEPTION 'DZ_IDEMPOTENCY_CONFLICT';
      END IF;
      v_id := v_k.id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    -- 4) Klinik kilidi (Σ pay / tavan okunmadan önce), sonra fatura satırı
    PERFORM pg_advisory_xact_lock(hashtext('sd:' || v_clinic));
    -- Kilit beklenirken aynı anahtarla eşzamanlı çağrı tamamlanmış olabilir
    IF v_key IS NOT NULL THEN
      SELECT d.id, d.doc_type, d.invoice_item_id, d.amount, d.description, d.discount_date
        INTO v_k FROM clinic_statement_discounts d
       WHERE d.lab_id = v_lab AND d.idempotency_key = v_key;
      IF v_k.id IS NOT NULL THEN
        IF v_k.doc_type IS DISTINCT FROM 'DZ' OR v_k.invoice_item_id IS DISTINCT FROM p_invoice_item_id
           OR v_k.amount IS DISTINCT FROM v_amount OR v_k.description IS DISTINCT FROM v_reason
           OR (p_doc_date IS NOT NULL AND v_k.discount_date IS DISTINCT FROM p_doc_date) THEN
          RAISE EXCEPTION 'DZ_IDEMPOTENCY_CONFLICT';
        END IF;
        v_id := v_k.id;
      END IF;
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
               'id', d.id, 'doc_no', d.doc_no, 'amount', d.amount,
               'to_invoice', x.to_inv, 'to_credit', d.amount - x.to_inv, 'replayed', true)
        FROM clinic_statement_discounts d
        CROSS JOIN LATERAL (
          SELECT COALESCE(sum(p.amount), 0) AS to_inv
            FROM payments p
           WHERE p.statement_discount_id = d.id AND p.invoice_id = d.invoice_id) x
       WHERE d.id = v_id);
  END IF;

  SELECT i.id, i.lab_id, i.clinic_id, i.currency, i.status, i.issue_date, i.total, i.paid_amount,
         i.rate_at_time, i.base_currency_at_time
    INTO v_inv
    FROM invoices i WHERE i.id = v_inv_id FOR UPDATE;
  IF NOT FOUND OR v_inv.clinic_id IS DISTINCT FROM v_clinic OR v_inv.lab_id IS DISTINCT FROM v_lab THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Durum ve tavan kilit altında
  IF v_inv.status IS NULL OR v_inv.status NOT IN ('kesildi', 'kismi_odendi', 'odendi') THEN
    RAISE EXCEPTION 'DZ_STATUS';
  END IF;
  SELECT COALESCE(it.net_total, 0) INTO v_net FROM invoice_items it
   WHERE it.id = p_invoice_item_id AND it.invoice_id = v_inv.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;
  -- Tavan (20261107102000): kalemin fatura toplamındaki payı (fatura altı indirim/KDV oranında,
  -- _profit_revenue_lines ile aynı oran) − aynı kalemdeki önceki DZ'ler; ayrıca faturadaki Σ DZ ≤ total.
  SELECT COALESCE(round(COALESCE(it0.net_total, it0.total, 0) * v_inv.total
                        / NULLIF((SELECT sum(COALESCE(it.net_total, it.total, 0)) FROM invoice_items it
                                   WHERE it.invoice_id = v_inv.id), 0), 2), 0)
    INTO v_share FROM invoice_items it0 WHERE it0.id = p_invoice_item_id;
  SELECT COALESCE(sum(d.amount), 0) INTO v_used FROM clinic_statement_discounts d
   WHERE d.invoice_item_id = p_invoice_item_id AND d.doc_type = 'DZ';
  SELECT COALESCE(sum(d.amount), 0) INTO v_used_inv FROM clinic_statement_discounts d
   WHERE d.invoice_id = v_inv.id AND d.doc_type = 'DZ';
  IF v_amount > v_share - v_used OR v_used_inv + v_amount > v_inv.total THEN
    RAISE EXCEPTION 'DZ_CAP';
  END IF;

  -- 5) DZ numarası (P7): lab başına ayrı sayaç; ilk satır MAX(DZ doc_no)+1 ile tohumlanır
  PERFORM pg_advisory_xact_lock(hashtext('dz:' || v_lab));
  INSERT INTO clinic_correction_counters AS c (lab_id, last_doc_no)
  VALUES (v_lab, (SELECT COALESCE(max(d.doc_no), 0) + 1 FROM clinic_statement_discounts d
                   WHERE d.lab_id = v_lab AND d.doc_type = 'DZ'))
  ON CONFLICT (lab_id) DO UPDATE
     SET last_doc_no = GREATEST(c.last_doc_no,
                                (SELECT COALESCE(max(d.doc_no), 0) FROM clinic_statement_discounts d
                                  WHERE d.lab_id = v_lab AND d.doc_type = 'DZ')) + 1
  RETURNING c.last_doc_no INTO v_doc;

  -- 6) Satır (P6): kur faturadan (rate_at_time, yoksa 1)
  v_date := COALESCE(p_doc_date, lab_today(v_lab));
  v_rate := COALESCE(v_inv.rate_at_time, 1);
  IF v_rate <= 0 THEN v_rate := 1; END IF;
  SELECT ls.default_currency INTO v_base FROM lab_settings ls WHERE ls.lab_id = v_lab;
  v_base := COALESCE(v_inv.base_currency_at_time, v_base, 'TRY');

  INSERT INTO clinic_statement_discounts (lab_id, clinic_id, currency, discount_date, period_from, period_to,
                                          kind, value, amount, base_amount, rate, amount_base, doc_no,
                                          description, idempotency_key, created_by,
                                          doc_type, invoice_id, invoice_item_id)
  VALUES (v_lab, v_clinic, v_inv.currency, v_date, v_inv.issue_date, v_inv.issue_date,
          'fixed', v_amount, v_amount, v_net, v_rate, round(v_amount * v_rate, 2), v_doc,
          v_reason, v_key, auth.uid(),
          'DZ', v_inv.id, p_invoice_item_id)
  RETURNING id INTO v_id;

  -- 7) Hedef faturanın açık kısmına pay (P8)
  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);

  IF v_inv.status IN ('kesildi', 'kismi_odendi') THEN
    SELECT v_inv.total - COALESCE(sum(p.amount), 0) INTO v_open FROM payments p WHERE p.invoice_id = v_inv.id;
    v_to_inv := GREATEST(LEAST(v_amount, v_open, v_inv.total - v_inv.paid_amount), 0);
    IF v_to_inv > 0 THEN
      INSERT INTO payments (lab_id, invoice_id, amount, payment_date, payment_method,
                            currency, rate_at_time, amount_base, base_currency_at_time,
                            receipt_id, received_by, statement_discount_id, notes)
      VALUES (v_lab, v_inv.id, v_to_inv, v_date, 'indirim',
              v_inv.currency, v_rate, round(v_to_inv * v_rate, 2), v_base,
              NULL, auth.uid(), v_id, 'DZ-' || v_doc);
    ELSE
      v_to_inv := 0;
    END IF;
  END IF;

  -- 8) Kalan: kliniğin aynı para birimindeki açık faturalarına, kalırsa alacak (K7)
  PERFORM _sd_apply_credit(v_lab, v_clinic, v_inv.currency);

  -- 9) GUC geri
  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);

  -- 10) Log
  PERFORM log_activity('correction_document_created', 'invoice', v_inv.id, 'DZ-' || v_doc,
    jsonb_build_object('amount', v_amount, 'currency', v_inv.currency,
                       'invoice_item_id', p_invoice_item_id, 'reason', v_reason),
    v_lab, auth.uid());

  -- 11) Sonuç
  RETURN jsonb_build_object('id', v_id, 'doc_no', v_doc, 'amount', v_amount,
                            'to_invoice', v_to_inv, 'to_credit', v_amount - v_to_inv,
                            'replayed', false);
END
$function$
;

COMMIT;
