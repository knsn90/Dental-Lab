-- ═══════════════════════════════════════════════════════════════════════════
-- 024 — Kasa / Banka Takibi
--   • cash_accounts  : Kasa ve banka hesapları
--   • cash_movements : Para giriş / çıkış hareketleri
--   • v_cash_summary : Hesap bazlı bakiye özeti
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Hesap tablosu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       UUID        NOT NULL DEFAULT get_my_lab_id(),
  name         TEXT        NOT NULL,              -- "Ana Kasa", "İş Bankası", …
  account_type TEXT        NOT NULL DEFAULT 'kasa'
               CHECK (account_type IN ('kasa', 'banka')),
  bank_name    TEXT,                              -- Sadece tip='banka' için
  iban         TEXT,
  currency     TEXT        NOT NULL DEFAULT 'TRY',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_accounts_lab_own" ON cash_accounts
  USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_cash_accounts_lab
  ON cash_accounts (lab_id, is_active);

-- ── 2. Hareket tablosu ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_movements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id         UUID        NOT NULL DEFAULT get_my_lab_id(),
  account_id     UUID        NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  direction      TEXT        NOT NULL CHECK (direction IN ('giris', 'cikis')),
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  category       TEXT        NOT NULL DEFAULT 'diger'
                 CHECK (category IN ('tahsilat','odeme','maas','kira','malzeme','vergi','diger')),
  description    TEXT        NOT NULL,
  ref_type       TEXT,                            -- 'invoice', 'expense', 'check', …
  ref_id         UUID,
  created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_movements_lab_own" ON cash_movements
  USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_cash_movements_account
  ON cash_movements (account_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_lab_date
  ON cash_movements (lab_id, movement_date DESC);

-- ── 3. Özet view ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_cash_account_summary AS
SELECT
  ca.id,
  ca.lab_id,
  ca.name,
  ca.account_type,
  ca.bank_name,
  ca.currency,
  ca.is_active,
  ca.opening_balance,
  COALESCE(SUM(CASE WHEN cm.direction = 'giris'  THEN cm.amount ELSE 0 END), 0) AS total_in,
  COALESCE(SUM(CASE WHEN cm.direction = 'cikis'  THEN cm.amount ELSE 0 END), 0) AS total_out,
  ca.opening_balance
    + COALESCE(SUM(CASE WHEN cm.direction = 'giris' THEN cm.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN cm.direction = 'cikis' THEN cm.amount ELSE 0 END), 0) AS balance
FROM cash_accounts ca
LEFT JOIN cash_movements cm ON cm.account_id = ca.id
GROUP BY ca.id, ca.lab_id, ca.name, ca.account_type, ca.bank_name, ca.currency, ca.is_active, ca.opening_balance;
