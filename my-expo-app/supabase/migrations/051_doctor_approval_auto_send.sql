-- ============================================================================
-- 051_doctor_approval_auto_send.sql
-- Bug #2 fix — Doktor onay linki otomatik iletim
--
-- generate_and_send_doctor_approval(wo_id, manager_id, base_url) RPC:
--   • token üretir (48h)
--   • work_orders.doctor_approval_* alanlarını günceller
--   • order_messages tablosuna otomatik mesaj kaydı atar (doktor inbox'ında görür)
--   • metadata json'da link, expires_at, type='doctor_approval_request' tutar
--   • Token'ı return eder (caller hâlâ kopya/paylaş için kullanabilir)
--
-- Backward compatibility: eski generate_doctor_approval_token RPC'si değişmez.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. order_messages.metadata JSONB kolonu (linkleri saklamak için)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE order_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
  -- message_type: 'text' | 'doctor_approval_request' | 'system_notice'

CREATE INDEX IF NOT EXISTS idx_order_messages_type
  ON order_messages(work_order_id, message_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. generate_and_send_doctor_approval — token + auto-message
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_and_send_doctor_approval(
  p_work_order_id UUID,
  p_manager_id    UUID,
  p_base_url      TEXT DEFAULT 'https://lab.esenkim.com'
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token       TEXT;
  v_link        TEXT;
  v_lab_id      UUID;
  v_order_no    TEXT;
  v_doctor_id   UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  -- Generate cryptographically random token (32 char URL-safe base64)
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  v_expires_at := NOW() + INTERVAL '48 hours';

  -- Persist on work_order
  UPDATE work_orders
     SET doctor_approval_token      = v_token,
         doctor_approval_expires_at = v_expires_at,
         doctor_approval_status     = 'pending',
         doctor_approval_required   = TRUE
   WHERE id = p_work_order_id
   RETURNING lab_id, order_number, doctor_id
        INTO v_lab_id, v_order_no, v_doctor_id;

  IF v_token IS NULL OR v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Work order not found: %', p_work_order_id;
  END IF;

  v_link := p_base_url || '/doctor-approval/' || v_token;

  -- Insert message into chat (doktor inbox'ında görür)
  INSERT INTO order_messages (
    work_order_id, lab_id, sender_id, content, message_type, metadata
  ) VALUES (
    p_work_order_id,
    v_lab_id,
    p_manager_id,
    '🩺 Tasarım onayınız bekleniyor' || E'\n\n' ||
    '#' || v_order_no || ' siparişi için tasarım hazırlandı. Lütfen aşağıdaki linkten inceleyip onaylayın:' || E'\n\n' ||
    v_link || E'\n\n' ||
    '⏱ Bu link 48 saat geçerlidir.',
    'doctor_approval_request',
    jsonb_build_object(
      'token',      v_token,
      'link',       v_link,
      'expires_at', v_expires_at,
      'order_number', v_order_no
    )
  );

  -- Audit
  INSERT INTO order_events (work_order_id, event_type, actor_id, metadata)
  VALUES (p_work_order_id, 'doctor_approval_sent', p_manager_id,
          jsonb_build_object('expires_at', v_expires_at, 'channel', 'in_app'));

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_and_send_doctor_approval(UUID, UUID, TEXT) TO authenticated;

COMMIT;
