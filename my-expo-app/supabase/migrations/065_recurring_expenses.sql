-- ═════════════════════════════════════════════════════════════════════════
-- 065_recurring_expenses.sql
--   Tekrarlayan Gider Şablonu
--
--   • recurring_expenses tablosu — periyot bazında otomatik üretim şablonu
--   • generate_recurring_expenses() RPC — vadesi gelen şablonları expenses'a yazar
--                                          (cron veya manuel tetiklenebilir)
--
--   Frekans: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
--   Anchor : ay içi gün (örn. 1, 15, 30) — geçmişe dönük üretim yok
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID NOT NULL DEFAULT get_my_lab_id(),
  name            TEXT NOT NULL,                          -- "Ofis kirası", "İnternet faturası"
  category        TEXT NOT NULL DEFAULT 'diger'
                  CHECK (category IN ('malzeme','kira','personel','ekipman','vergi','diger')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'havale'
                  CHECK (payment_method IN ('nakit','kart','havale','cek','diger')),
  frequency       TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  anchor_day      INT  NOT NULL DEFAULT 1
                  CHECK (anchor_day BETWEEN 1 AND 31),     -- monthly/quarterly/yearly: ay içi gün
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,                                    -- null → süresiz
  next_due_date   DATE NOT NULL DEFAULT CURRENT_DATE,      -- bir sonraki üretim tarihi
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_expenses_lab_idx ON recurring_expenses(lab_id, active, next_due_date);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_expenses_lab_all ON recurring_expenses;
CREATE POLICY recurring_expenses_lab_all ON recurring_expenses
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Sonraki vadeyi hesapla ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_next_due(
  p_current     DATE,
  p_frequency   TEXT,
  p_anchor_day  INT
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_next DATE;
BEGIN
  CASE p_frequency
    WHEN 'weekly'    THEN v_next := p_current + INTERVAL '7 days';
    WHEN 'monthly'   THEN v_next := (date_trunc('month', p_current) + INTERVAL '1 month')::DATE
                                    + (LEAST(p_anchor_day,
                                       EXTRACT(DAY FROM (date_trunc('month', p_current) + INTERVAL '2 months' - INTERVAL '1 day'))::INT) - 1);
    WHEN 'quarterly' THEN v_next := (p_current + INTERVAL '3 months')::DATE;
    WHEN 'yearly'    THEN v_next := (p_current + INTERVAL '1 year')::DATE;
    ELSE v_next := p_current + INTERVAL '1 month';
  END CASE;
  RETURN v_next;
END;
$$;

-- ─── Şablonlardan vadesi gelen giderleri üret ────────────────────────────
CREATE OR REPLACE FUNCTION generate_recurring_expenses(p_lab_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  r       RECORD;
BEGIN
  FOR r IN
    SELECT *
      FROM recurring_expenses
     WHERE active = true
       AND (p_lab_id IS NULL OR lab_id = p_lab_id)
       AND next_due_date <= CURRENT_DATE
       AND (end_date IS NULL OR next_due_date <= end_date)
  LOOP
    -- Idempotency: aynı şablon + tarih için varsa atla
    IF NOT EXISTS (
      SELECT 1 FROM expenses
       WHERE lab_id = r.lab_id
         AND expense_date = r.next_due_date
         AND description = r.name
         AND amount = r.amount
    ) THEN
      INSERT INTO expenses (
        lab_id, category, description, amount, expense_date, payment_method, notes
      ) VALUES (
        r.lab_id, r.category, r.name, r.amount, r.next_due_date, r.payment_method,
        COALESCE(r.notes, '') || ' [otomatik · şablon: ' || r.id::TEXT || ']'
      );
      v_count := v_count + 1;
    END IF;

    -- Sonraki vadeyi ileri al
    UPDATE recurring_expenses
       SET next_due_date = compute_next_due(r.next_due_date, r.frequency, r.anchor_day),
           updated_at    = now()
     WHERE id = r.id;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_next_due(DATE, TEXT, INT)         TO authenticated;
GRANT EXECUTE ON FUNCTION generate_recurring_expenses(UUID)         TO authenticated;
