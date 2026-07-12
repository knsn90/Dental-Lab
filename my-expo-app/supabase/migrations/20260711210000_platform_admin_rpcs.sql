-- ============================================================
-- Super-admin yönetim RPC'leri + platform audit log
-- Hepsi is_platform_admin() ile korunur; lab RLS'ine dokunulmaz.
-- Idempotent.
-- ============================================================

-- Platform-seviyesi denetim kaydı (god-mode aksiyonları)
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES auth.users(id),
  action     text NOT NULL,
  target_lab uuid,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_audit_read ON platform_audit_log;
CREATE POLICY platform_audit_read ON platform_audit_log FOR SELECT USING (is_platform_admin());

-- Lab detayı (bilgi + kullanıcılar + sayımlar)
CREATE OR REPLACE FUNCTION admin_lab_detail(p_lab uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = '42501'; END IF;
  SELECT jsonb_build_object(
    'lab', to_jsonb(l),
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'email', p.email,
        'user_type', p.user_type, 'role', p.role, 'created_at', p.created_at
      ) ORDER BY p.created_at)
      FROM profiles p WHERE p.lab_id = l.id), '[]'::jsonb),
    'counts', jsonb_build_object(
      'users',    (SELECT count(*) FROM profiles p    WHERE p.lab_id = l.id),
      'orders',   (SELECT count(*) FROM work_orders w WHERE w.lab_id = l.id),
      'clinics',  (SELECT count(*) FROM clinics c     WHERE c.lab_id = l.id),
      'invoices', (SELECT count(*) FROM invoices i    WHERE i.lab_id = l.id)
    )
  ) INTO v FROM labs l WHERE l.id = p_lab;
  IF v IS NULL THEN RAISE EXCEPTION 'lab not found' USING errcode = 'P0002'; END IF;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION admin_lab_detail(uuid) TO authenticated;

-- Lab aktif/askıya al
CREATE OR REPLACE FUNCTION admin_set_lab_status(p_lab uuid, p_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = '42501'; END IF;
  UPDATE labs SET is_active = p_active WHERE id = p_lab;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab not found' USING errcode = 'P0002'; END IF;
  INSERT INTO platform_audit_log (actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'set_status', p_lab, jsonb_build_object('is_active', p_active));
  RETURN p_active;
END $$;
GRANT EXECUTE ON FUNCTION admin_set_lab_status(uuid, boolean) TO authenticated;

-- Lab planı değiştir
CREATE OR REPLACE FUNCTION admin_set_lab_plan(p_lab uuid, p_plan text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = '42501'; END IF;
  IF p_plan NOT IN ('trial','active','pro','enterprise','suspended') THEN
    RAISE EXCEPTION 'invalid plan' USING errcode = '22023';
  END IF;
  UPDATE labs SET plan = p_plan WHERE id = p_lab;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab not found' USING errcode = 'P0002'; END IF;
  INSERT INTO platform_audit_log (actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'set_plan', p_lab, jsonb_build_object('plan', p_plan));
  RETURN p_plan;
END $$;
GRANT EXECUTE ON FUNCTION admin_set_lab_plan(uuid, text) TO authenticated;

-- ============================================================
-- END — platform admin management RPCs
-- ============================================================
