-- supplier_balances view: ödemeleri (PAYMENT/RETURN) borçtan DÜŞÜR, üzerine eklemesin.
-- Önceki sürüm SUM(amount_base) yapıyordu — PAYMENT da pozitif yazıldığı için
-- borç azalmak yerine ARTIYORDU. Doğru hesap: PURCHASE=+, PAYMENT/RETURN=-.

CREATE OR REPLACE VIEW public.supplier_balances AS
SELECT
  s.id                AS supplier_id,
  s.lab_id,
  s.name,
  s.default_currency,
  COALESCE(SUM(
    CASE
      WHEN st.type = 'PURCHASE'              THEN st.amount_base
      WHEN st.type IN ('PAYMENT','RETURN')   THEN -st.amount_base
      WHEN st.type = 'ADJUSTMENT'            THEN st.amount_base
      ELSE 0
    END
  ), 0)  AS balance_base,
  COALESCE(SUM(CASE WHEN st.type = 'PURCHASE' THEN st.amount_base ELSE 0 END), 0) AS total_purchases,
  COALESCE(SUM(CASE WHEN st.type = 'PAYMENT'  THEN st.amount_base ELSE 0 END), 0) AS total_payments,
  COALESCE(SUM(CASE WHEN st.type = 'RETURN'   THEN st.amount_base ELSE 0 END), 0) AS total_returns,
  COUNT(st.id) FILTER (WHERE st.type = 'PURCHASE') AS purchase_count,
  MAX(st.transaction_date)          AS last_transaction_date
FROM public.suppliers s
LEFT JOIN public.supplier_transactions st ON st.supplier_id = s.id
GROUP BY s.id, s.lab_id, s.name, s.default_currency;
