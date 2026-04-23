-- İş emri mesajları tablosu (lab ↔ hekim iletişimi)
CREATE TABLE IF NOT EXISTS order_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES profiles(id),
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

-- Lab, admin ve ilgili hekimin iş emri mesajlarına erişimi var
CREATE POLICY "order_messages_lab_admin" ON order_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('lab', 'admin')
    )
  );

CREATE POLICY "order_messages_doctor" ON order_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- Hızlı sorgular için index
CREATE INDEX IF NOT EXISTS order_messages_work_order_idx ON order_messages(work_order_id, created_at);
