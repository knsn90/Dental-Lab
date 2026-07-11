-- ═══════════════════════════════════════════════════════════════════════
--  Payment Reminders — Admin → Klinik ödeme hatırlatması
--
--  Mevcut `payment_reminders` (064) tablosunu uyarlar:
--   · invoice_id zorunluluğu kaldırılır → klinik-genel hatırlatma da yapılabilir
--   · Snapshot sütunları eklenir (total_due / overdue_due / overdue_count)
--   · recipients_count eklenir (kaç notification düşürüldü)
--  Yeni RPC'ler:
--   · send_payment_reminder(clinic_id, invoice_id?, message?, severity?)
--   · send_payment_reminders_bulk(message?, severity?)
--   · last_payment_reminder(clinic_id)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE payment_reminders ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE payment_reminders ALTER COLUMN body       DROP NOT NULL;

ALTER TABLE payment_reminders
  ADD COLUMN IF NOT EXISTS total_due        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_due      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_count    INT           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipients_count INT           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message          TEXT,
  ADD COLUMN IF NOT EXISTS severity         TEXT;

-- Severity check (yumuşak — yalnızca yeni satırlar için)
-- (mevcut satırlar NULL olabilir → CHECK NULL allow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_reminders_severity_check'
  ) THEN
    ALTER TABLE payment_reminders
      ADD CONSTRAINT payment_reminders_severity_check
      CHECK (severity IS NULL OR severity IN ('info','warning','urgent'));
  END IF;
END $$;

-- Klinik kullanıcısının kendi hatırlatmalarını görmesi için ek SELECT policy
DROP POLICY IF EXISTS payment_reminders_clinic_select ON payment_reminders;
CREATE POLICY payment_reminders_clinic_select ON payment_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.clinic_id = payment_reminders.clinic_id
        AND p.user_type IN ('clinic_admin','clinic_secretary','doctor')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
--  RPC: send_payment_reminder
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_payment_reminder(
  p_clinic_id   UUID,
  p_invoice_id  UUID DEFAULT NULL,
  p_message     TEXT DEFAULT NULL,
  p_severity    TEXT DEFAULT 'info'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_user_type     TEXT;
  v_role          TEXT;
  v_lab_id        UUID;
  v_clinic_name   TEXT;
  v_total_due     NUMERIC := 0;
  v_overdue_due   NUMERIC := 0;
  v_overdue_count INT     := 0;
  v_reminder_id   UUID;
  v_title         TEXT;
  v_body          TEXT;
  v_recipients    INT     := 0;
  v_tone          TEXT;
  v_url           TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- Yetki: lab admin / manager / accountant
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
    RAISE EXCEPTION 'Hatırlatma gönderme yetkiniz yok.';
  END IF;

  IF p_severity NOT IN ('info','warning','urgent') THEN
    RAISE EXCEPTION 'Geçersiz öncelik seviyesi.';
  END IF;

  v_tone := CASE p_severity
              WHEN 'urgent'  THEN 'firm'
              WHEN 'warning' THEN 'standard'
              ELSE                 'gentle'
            END;

  -- Lab + klinik kontrolü
  SELECT lab_id, name INTO v_lab_id, v_clinic_name FROM clinics WHERE id = p_clinic_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Klinik bulunamadı.';
  END IF;
  IF v_lab_id <> get_my_lab_id() THEN
    RAISE EXCEPTION 'Farklı bir laboratuvarın kliniğine hatırlatma gönderemezsiniz.';
  END IF;

  -- Bakiye snapshot — tek fatura ya da tüm açık faturalar
  IF p_invoice_id IS NOT NULL THEN
    SELECT
      GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0)),
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE
           THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))
           ELSE 0 END,
      CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 1 ELSE 0 END
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices
    WHERE id = p_invoice_id AND clinic_id = p_clinic_id;
  ELSE
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))), 0),
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE
                        THEN GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))
                        ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)
      INTO v_total_due, v_overdue_due, v_overdue_count
    FROM invoices
    WHERE clinic_id = p_clinic_id
      AND status IN ('kesildi','kismi_odendi');
  END IF;

  IF v_total_due <= 0 THEN
    RAISE EXCEPTION 'Bu klinik için açık borç yok, hatırlatma gerekmiyor.';
  END IF;

  -- Notification başlık + gövde
  v_title := CASE p_severity
               WHEN 'urgent'  THEN '🔴 ACİL: Ödeme Bekliyor'
               WHEN 'warning' THEN '⚠️ Ödeme Hatırlatması'
               ELSE                 'Ödeme Hatırlatması'
             END;
  v_body  := CONCAT_WS(' ',
              CASE WHEN v_overdue_count > 0
                   THEN v_overdue_count::TEXT || ' fatura vadesini aştı.'
                   ELSE NULL END,
              'Açık borç: ₺' || TO_CHAR(v_total_due, 'FM999G999G990D00') || '.',
              CASE WHEN p_message IS NOT NULL AND LENGTH(BTRIM(p_message)) > 0
                   THEN '— ' || BTRIM(p_message)
                   ELSE NULL END
             );

  -- Hatırlatma kaydı
  INSERT INTO payment_reminders (
    lab_id, clinic_id, invoice_id,
    channel, tone, subject, body, status,
    sent_by, sent_at,
    total_due, overdue_due, overdue_count,
    message, severity
  ) VALUES (
    v_lab_id, p_clinic_id, p_invoice_id,
    'in_app', v_tone, v_title, v_body, 'sent',
    v_user_id, NOW(),
    v_total_due, v_overdue_due, v_overdue_count,
    NULLIF(BTRIM(p_message), ''), p_severity
  )
  RETURNING id INTO v_reminder_id;

  v_url := '/(clinic)/finance?tab=overview';

  -- Notification'ları klinik kullanıcılarına düşür
  WITH inserted AS (
    INSERT INTO notifications (
      user_id, lab_id, category, title, body,
      resource_type, resource_id, action_url, payload
    )
    SELECT
      p.id,
      v_lab_id,
      'payment',
      v_title,
      v_body,
      CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE 'clinic_balance' END,
      COALESCE(p_invoice_id, p_clinic_id),
      v_url,
      jsonb_build_object(
        'reminder_id',   v_reminder_id,
        'clinic_id',     p_clinic_id,
        'invoice_id',    p_invoice_id,
        'total_due',     v_total_due,
        'overdue_due',   v_overdue_due,
        'overdue_count', v_overdue_count,
        'severity',      p_severity,
        'message',       p_message
      )
    FROM profiles p
    WHERE p.clinic_id = p_clinic_id
      AND p.user_type IN ('clinic_admin','clinic_secretary','doctor')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_recipients FROM inserted;

  UPDATE payment_reminders
     SET recipients_count = v_recipients
   WHERE id = v_reminder_id;

  RETURN v_reminder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_payment_reminder(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  RPC: bulk — tüm vadesi geçen klinikler
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_payment_reminders_bulk(
  p_message  TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'warning'
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_user_type TEXT;
  v_role      TEXT;
  v_lab_id    UUID;
  v_clinic    RECORD;
  v_sent      INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  SELECT user_type, role INTO v_user_type, v_role FROM profiles WHERE id = v_user_id;
  IF NOT (v_user_type = 'admin' OR (v_user_type = 'lab' AND v_role IN ('manager','admin','accountant'))) THEN
    RAISE EXCEPTION 'Yetki yok.';
  END IF;
  v_lab_id := get_my_lab_id();

  FOR v_clinic IN
    SELECT clinic_id
    FROM invoices
    WHERE lab_id = v_lab_id
      AND status IN ('kesildi','kismi_odendi')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
      AND clinic_id IS NOT NULL
    GROUP BY clinic_id
    HAVING SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(paid_amount,0))) > 0
  LOOP
    BEGIN
      PERFORM send_payment_reminder(v_clinic.clinic_id, NULL, p_message, p_severity);
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN v_sent;
END;
$$;

GRANT EXECUTE ON FUNCTION send_payment_reminders_bulk(TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  RPC: bir kliniğe gönderilmiş son hatırlatma
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION last_payment_reminder(p_clinic_id UUID)
RETURNS TABLE(
  id UUID,
  sent_at TIMESTAMPTZ,
  severity TEXT,
  message TEXT,
  total_due NUMERIC,
  overdue_count INT,
  recipients_count INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.sent_at, pr.severity, pr.message,
         pr.total_due, pr.overdue_count, pr.recipients_count
    FROM payment_reminders pr
   WHERE pr.clinic_id = p_clinic_id
   ORDER BY pr.sent_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION last_payment_reminder(UUID) TO authenticated;
