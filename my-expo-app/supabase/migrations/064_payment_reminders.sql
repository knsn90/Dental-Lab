-- ═════════════════════════════════════════════════════════════════════════
-- 064_payment_reminders.sql
--   Tahsilat Hatırlatma Akışı
--
--   • payment_reminders tablosu — gönderilen her hatırlatmanın kaydı
--   • reminder_templates tablosu — kurum içi şablonlar (3 ton: nazik/std/sert)
--   • generate_payment_reminder() RPC — fatura ID + ton → hazır mesaj döner
--   • send_payment_reminder()    RPC — hatırlatmayı kaydeder (in-app/email/sms)
--
--   Kanallar: 'in_app' | 'email' | 'sms' | 'whatsapp'
--   Statüler: 'queued' | 'sent' | 'failed' | 'bounced'
-- ═════════════════════════════════════════════════════════════════════════

-- ─── Reminder Templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  tone         TEXT NOT NULL CHECK (tone IN ('gentle','standard','firm')),
  subject      TEXT,                          -- e-posta başlığı (opsiyonel)
  body         TEXT NOT NULL,                 -- {{clinic_name}} {{invoice_number}} {{amount}} {{days_overdue}} {{due_date}}
  is_default   BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminder_templates_lab_idx ON reminder_templates(lab_id, tone);

ALTER TABLE reminder_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reminder_templates_lab_all ON reminder_templates;
CREATE POLICY reminder_templates_lab_all ON reminder_templates
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Payment Reminders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  clinic_id       UUID REFERENCES clinics(id) ON DELETE SET NULL,
  template_id     UUID REFERENCES reminder_templates(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('in_app','email','sms','whatsapp')),
  tone            TEXT NOT NULL CHECK (tone IN ('gentle','standard','firm')),
  subject         TEXT,
  body            TEXT NOT NULL,
  recipient       TEXT,                       -- e-posta / telefon (opsiyonel snapshot)
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','failed','bounced','read')),
  error_message   TEXT,
  sent_by         UUID REFERENCES profiles(id),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_reminders_invoice_idx ON payment_reminders(invoice_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS payment_reminders_clinic_idx  ON payment_reminders(clinic_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS payment_reminders_lab_idx     ON payment_reminders(lab_id, sent_at DESC);

ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_reminders_lab_all ON payment_reminders;
CREATE POLICY payment_reminders_lab_all ON payment_reminders
  FOR ALL USING (lab_id = get_my_lab_id())
  WITH CHECK (lab_id = get_my_lab_id());

-- ─── Default templates (3 ton) — her lab için seed yardımcısı ────────────
CREATE OR REPLACE FUNCTION seed_default_reminder_templates(p_lab_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Yalnızca yoksa ekle
  IF NOT EXISTS (SELECT 1 FROM reminder_templates WHERE lab_id = p_lab_id) THEN
    INSERT INTO reminder_templates (lab_id, name, tone, subject, body, is_default, active) VALUES
    (
      p_lab_id, 'Nazik Hatırlatma', 'gentle',
      'Fatura Hatırlatması — {{invoice_number}}',
      'Sayın {{clinic_name}},

{{invoice_number}} numaralı, {{amount}} tutarındaki faturanın vadesi {{due_date}} tarihinde dolmuştur. Yoğunluğunuz nedeniyle gözden kaçmış olabileceğini düşünerek hatırlatma yapma gereği duyduk.

Ödemenizi en kısa sürede tamamlamanızı rica ederiz. Sorunuz olursa bize ulaşabilirsiniz.

Teşekkürler.',
      true, true
    ),
    (
      p_lab_id, 'Standart Hatırlatma', 'standard',
      'Vadesi Geçmiş Fatura — {{invoice_number}}',
      'Sayın {{clinic_name}},

{{invoice_number}} numaralı, {{amount}} tutarındaki faturanın vadesi {{days_overdue}} gün önce dolmuştur ({{due_date}}). Lütfen ödemenizi gerçekleştiriniz.

İyi çalışmalar.',
      true, true
    ),
    (
      p_lab_id, 'Sert Uyarı', 'firm',
      'ACİL: Vadesi Geçmiş Fatura — {{invoice_number}}',
      'Sayın {{clinic_name}},

{{invoice_number}} numaralı, {{amount}} tutarındaki faturanın vadesi {{days_overdue}} gün önce dolmuştur. Bu hatırlatmaya rağmen ödeme yapılmaması durumunda hizmetlerimizin askıya alınması ve yasal süreç başlatılması söz konusu olacaktır.

Konuyla ilgili acil iletişime geçmenizi rica ederiz.',
      true, true
    );
  END IF;
END;
$$;

-- ─── Şablon değişken doldurucu ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION render_reminder_template(
  p_template_body TEXT,
  p_invoice_id    UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_inv         RECORD;
  v_clinic_name TEXT;
  v_days        INT;
  v_amount_txt  TEXT;
  v_due_date    TEXT;
  v_result      TEXT;
BEGIN
  SELECT i.invoice_number, i.due_date, i.total - i.paid_amount AS balance, i.clinic_id
    INTO v_inv
    FROM invoices i
   WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  SELECT name INTO v_clinic_name FROM clinics WHERE id = v_inv.clinic_id;

  v_days       := COALESCE(CURRENT_DATE - v_inv.due_date, 0);
  v_amount_txt := '₺' || to_char(COALESCE(v_inv.balance, 0), 'FM999G999G999D00');
  v_due_date   := COALESCE(to_char(v_inv.due_date, 'DD.MM.YYYY'), '—');

  v_result := REPLACE(p_template_body, '{{clinic_name}}',    COALESCE(v_clinic_name, 'Müşterimiz'));
  v_result := REPLACE(v_result,         '{{invoice_number}}', v_inv.invoice_number);
  v_result := REPLACE(v_result,         '{{amount}}',         v_amount_txt);
  v_result := REPLACE(v_result,         '{{days_overdue}}',   v_days::TEXT);
  v_result := REPLACE(v_result,         '{{due_date}}',       v_due_date);

  RETURN v_result;
END;
$$;

-- ─── Hatırlatma kaydı oluştur (in-app default) ───────────────────────────
CREATE OR REPLACE FUNCTION send_payment_reminder(
  p_invoice_id UUID,
  p_tone       TEXT DEFAULT 'standard',
  p_channel    TEXT DEFAULT 'in_app',
  p_template_id UUID DEFAULT NULL,
  p_recipient   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lab_id     UUID;
  v_clinic_id  UUID;
  v_template   RECORD;
  v_body       TEXT;
  v_subject    TEXT;
  v_id         UUID;
BEGIN
  SELECT lab_id, clinic_id INTO v_lab_id, v_clinic_id FROM invoices WHERE id = p_invoice_id;
  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- Şablonu seç (parametre verildiyse o; yoksa lab'ın varsayılan tone şablonu)
  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM reminder_templates WHERE id = p_template_id AND lab_id = v_lab_id;
  ELSE
    SELECT * INTO v_template
      FROM reminder_templates
     WHERE lab_id = v_lab_id AND tone = p_tone AND active = true
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    -- Şablon yoksa otomatik seed
    PERFORM seed_default_reminder_templates(v_lab_id);
    SELECT * INTO v_template
      FROM reminder_templates
     WHERE lab_id = v_lab_id AND tone = p_tone AND active = true
     ORDER BY is_default DESC LIMIT 1;
  END IF;

  v_body    := render_reminder_template(v_template.body, p_invoice_id);
  v_subject := CASE WHEN v_template.subject IS NOT NULL
                    THEN render_reminder_template(v_template.subject, p_invoice_id)
                    ELSE NULL END;

  INSERT INTO payment_reminders
    (lab_id, invoice_id, clinic_id, template_id, channel, tone, subject, body, recipient, status, sent_by)
  VALUES
    (v_lab_id, p_invoice_id, v_clinic_id, v_template.id, p_channel, p_tone, v_subject, v_body, p_recipient,
     CASE WHEN p_channel = 'in_app' THEN 'sent' ELSE 'queued' END,
     auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_default_reminder_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION render_reminder_template(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION send_payment_reminder(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ─── Convenience view: invoice + son hatırlatma + sayım ──────────────────
CREATE OR REPLACE VIEW v_invoice_reminders AS
SELECT
  i.id                                          AS invoice_id,
  i.lab_id,
  i.invoice_number,
  i.clinic_id,
  i.due_date,
  i.total,
  i.paid_amount,
  i.total - i.paid_amount                       AS balance,
  COUNT(pr.id)                                  AS reminder_count,
  MAX(pr.sent_at)                               AS last_reminder_at,
  (ARRAY_AGG(pr.tone ORDER BY pr.sent_at DESC))[1] AS last_reminder_tone
FROM invoices i
LEFT JOIN payment_reminders pr ON pr.invoice_id = i.id
GROUP BY i.id;

GRANT SELECT ON v_invoice_reminders TO authenticated;
