-- ============================================================
-- Fix: activity_logs actor_id FK violation on work order insert
-- doctor_id may not exist in profiles (external doctor records)
-- Solution: fetch actor_id via SELECT INTO — returns NULL if not found
-- ============================================================

CREATE OR REPLACE FUNCTION log_work_order_created()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id UUID;
  v_name     TEXT;
  v_type     TEXT;
BEGIN
  -- Safely fetch profile — v_actor_id stays NULL if doctor not in profiles
  SELECT id, full_name, user_type
    INTO v_actor_id, v_name, v_type
  FROM profiles
  WHERE id = NEW.doctor_id
  LIMIT 1;

  INSERT INTO activity_logs (
    actor_id, actor_name, actor_type,
    action, entity_type, entity_id, entity_label
  ) VALUES (
    v_actor_id,                          -- NULL-safe: no FK violation
    COALESCE(v_name, 'Bilinmeyen'),
    COALESCE(v_type, 'doctor'),
    'İş emri oluşturdu',
    'work_order', NEW.id, NEW.order_number
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
