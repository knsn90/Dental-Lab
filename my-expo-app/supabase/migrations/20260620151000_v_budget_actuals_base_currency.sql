-- FIX (Faz A): v_budget_actuals gerçekleşen gideri ham döviz topluyordu
-- (sum(e.amount)) → bütçe ₺ iken EUR/USD giderler TL gibi sayılıyordu. Gerçekleşen
-- artık BAZ para biriminde: sum(amount_base) (yoksa amount). Kolon adları aynı.
CREATE OR REPLACE VIEW public.v_budget_actuals AS
  SELECT id,
    lab_id,
    category,
    period,
    period_start,
    amount AS budget_amount,
    COALESCE(( SELECT sum(COALESCE(e.amount_base, e.amount)) AS sum
           FROM expenses e
          WHERE e.lab_id = b.lab_id AND (b.category = 'total'::text OR e.category = b.category) AND e.expense_date >= b.period_start AND e.expense_date <
                CASE b.period
                    WHEN 'monthly'::text THEN (b.period_start + '1 mon'::interval)::date
                    WHEN 'yearly'::text THEN (b.period_start + '1 year'::interval)::date
                    ELSE (b.period_start + '1 mon'::interval)::date
                END), 0::numeric) AS actual_amount,
    notes,
    created_at,
    updated_at
   FROM budgets b;
