-- Finans → Rapor: KESİNLEŞMEMİŞ GELİR ayrı sütun (2026-11-24)
-- Teslim edilmiş ama faturası henüz kesilmemiş iş = tahakkuk esasına göre kazanılmış gelir
-- ("faturalanmamış gelir"). Teslimde otomatik açılan TASLAK faturalardan okunur, KDV hariç
-- (subtotal × saklı kur), ay = taslağın issue_date'i (teslim günü; kesilince değişmez).
-- `income` (kesilen fatura) DEĞİŞMEZ — Karlılık ile aynı kalır. Yeni sütun sona eklenir.
-- Çift sayım koruması: siparişi (work_order_id veya invoice_orders) kesilmiş bir faturada
-- bulunan taslak sayılmaz. Üretimdeki iş SAYILMAZ (henüz kazanılmadı).
-- Geri alma: rollbacks/20261124061459_rapor_kesinlesmemis_gelir.down.sql

CREATE OR REPLACE FUNCTION public._draft_is_unbilled(p_invoice_id uuid, p_work_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH wos AS (
    SELECT p_work_order_id AS wo WHERE p_work_order_id IS NOT NULL
    UNION SELECT io.work_order_id FROM invoice_orders io WHERE io.invoice_id = p_invoice_id
  )
  SELECT NOT EXISTS (
    SELECT 1 FROM invoices k
     WHERE k.id <> p_invoice_id
       AND k.status IN ('kesildi','kismi_odendi','odendi')
       AND ( k.work_order_id IN (SELECT wo FROM wos)
          OR EXISTS (SELECT 1 FROM invoice_orders ko WHERE ko.invoice_id = k.id AND ko.work_order_id IN (SELECT wo FROM wos)) )
  );
$$;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary WITH (security_invoker = on) AS
 SELECT month,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit,
    sum(unbilled) AS income_unbilled
   FROM ( SELECT date_trunc('month'::text, i.issue_date::timestamp with time zone)::date AS month,
            i.subtotal * COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0::numeric), 1::numeric) AS income,
            0::numeric AS expense,
            0::numeric AS unbilled
           FROM invoices i
          WHERE i.lab_id = get_my_lab_id() AND (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, e.expense_date::timestamp with time zone)::date,
            0,
            fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date),
            0
           FROM expenses e
          WHERE e.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, d.discount_date::timestamp with time zone)::date,
            - d.amount_base,
            0,
            0
           FROM v_statement_discount_effective d
          WHERE d.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, t.issue_date::timestamp with time zone)::date,
            0,
            0,
            t.subtotal * COALESCE(t.rate_at_time, t.amount_base / NULLIF(t.total, 0::numeric), 1::numeric)
           FROM invoices t
          WHERE t.lab_id = get_my_lab_id() AND t.status = 'taslak' AND t.issue_date IS NOT NULL
            AND _draft_is_unbilled(t.id, t.work_order_id)) sub
  GROUP BY month
  ORDER BY month DESC;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy WITH (security_invoker = on) AS
 SELECT month,
    currency,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit,
    sum(unbilled) AS income_unbilled
   FROM ( SELECT date_trunc('month'::text, invoices.issue_date::timestamp with time zone)::date AS month,
            COALESCE(invoices.currency, 'TRY'::text) AS currency,
            invoices.subtotal AS income,
            0::numeric AS expense,
            0::numeric AS unbilled
           FROM invoices
          WHERE invoices.lab_id = get_my_lab_id() AND (invoices.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, expenses.expense_date::timestamp with time zone)::date,
            COALESCE(expenses.currency, 'TRY'::text),
            0,
            expenses.amount,
            0
           FROM expenses
          WHERE expenses.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, d.discount_date::timestamp with time zone)::date,
            d.currency,
            - d.amount,
            0,
            0
           FROM v_statement_discount_effective d
          WHERE d.lab_id = get_my_lab_id()
        UNION ALL
         SELECT date_trunc('month'::text, t.issue_date::timestamp with time zone)::date,
            COALESCE(t.currency, 'TRY'::text),
            0,
            0,
            t.subtotal
           FROM invoices t
          WHERE t.lab_id = get_my_lab_id() AND t.status = 'taslak' AND t.issue_date IS NOT NULL
            AND _draft_is_unbilled(t.id, t.work_order_id)) sub
  GROUP BY month, currency
  ORDER BY month DESC, currency;

REVOKE ALL ON FUNCTION public._draft_is_unbilled(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._draft_is_unbilled(uuid, uuid) TO authenticated;
