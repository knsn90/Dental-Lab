-- Tedarikçiler listesinde ₺ bakiyenin yanına orijinal döviz (€/$) göstermek için:
-- supplier_balances view'ine balance_original eklendi — tedarikçinin KENDİ para
-- biriminde (default_currency) net bakiye. Yalnız default_currency işlemleri sayılır
-- (ör. ₺ ödeme yapılmış EUR alış karışımında orijinal toplamı saptırmasın diye client
-- yalnızca baz bakiye ≠ 0 iken bu değeri gösterir).
-- CREATE OR REPLACE: sona kolon eklemek güvenli, DROP gerekmez.
CREATE OR REPLACE VIEW public.supplier_balances AS
 SELECT s.id AS supplier_id,
    s.lab_id,
    s.name,
    s.default_currency,
    COALESCE(sum(
        CASE
            WHEN st.type = 'PURCHASE'::text THEN st.amount_base
            WHEN st.type = ANY (ARRAY['PAYMENT'::text, 'RETURN'::text]) THEN - st.amount_base
            WHEN st.type = 'ADJUSTMENT'::text THEN st.amount_base
            ELSE 0::numeric
        END), 0::numeric) AS balance_base,
    COALESCE(sum(
        CASE
            WHEN st.type = 'PURCHASE'::text THEN st.amount_base
            ELSE 0::numeric
        END), 0::numeric) AS total_purchases,
    COALESCE(sum(
        CASE
            WHEN st.type = 'PAYMENT'::text THEN st.amount_base
            ELSE 0::numeric
        END), 0::numeric) AS total_payments,
    COALESCE(sum(
        CASE
            WHEN st.type = 'RETURN'::text THEN st.amount_base
            ELSE 0::numeric
        END), 0::numeric) AS total_returns,
    count(st.id) FILTER (WHERE st.type = 'PURCHASE'::text) AS purchase_count,
    max(st.transaction_date) AS last_transaction_date,
    COALESCE(sum(
        CASE WHEN st.currency = s.default_currency THEN
            CASE
                WHEN st.type = 'PURCHASE'::text THEN st.amount
                WHEN st.type = ANY (ARRAY['PAYMENT'::text, 'RETURN'::text]) THEN - st.amount
                WHEN st.type = 'ADJUSTMENT'::text THEN st.amount
                ELSE 0::numeric
            END
        ELSE 0::numeric END), 0::numeric) AS balance_original
   FROM suppliers s
     LEFT JOIN supplier_transactions st ON st.supplier_id = s.id
  GROUP BY s.id, s.lab_id, s.name, s.default_currency;
