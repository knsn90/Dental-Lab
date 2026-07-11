-- Avans Talepleri — onay akışlı (bekliyor → onaylandi/reddedildi/iptal)
-- Teknisyen talep eder; admin onaylar. Onaylanınca employee_advances defterine işlenir.
-- employee_leaves (izin) ile aynı lab-scoped RLS desenini izler.

CREATE TABLE IF NOT EXISTS employee_advance_requests (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        UUID          NOT NULL DEFAULT get_my_lab_id(),
  employee_id   UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason        TEXT,
  status        TEXT          NOT NULL DEFAULT 'bekliyor'
                CHECK (status IN ('bekliyor','onaylandi','reddedildi','iptal')),
  reject_reason TEXT,
  approved_by   UUID          REFERENCES profiles(id),
  approved_at   TIMESTAMPTZ,
  advance_id    UUID          REFERENCES employee_advances(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE employee_advance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ear_lab_own" ON employee_advance_requests
  USING  (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

CREATE INDEX IF NOT EXISTS idx_ear_lab_status ON employee_advance_requests (lab_id, status);
CREATE INDEX IF NOT EXISTS idx_ear_employee   ON employee_advance_requests (employee_id);
