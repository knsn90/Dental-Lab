-- ============================================================
-- Platform konsolu F1 — istatistik, büyüme, lab yönetimi, audit, admin yönetimi
-- Hepsi is_platform_admin() korumalı SECURITY DEFINER. Idempotent.
-- ============================================================

-- ── Genel bakış istatistikleri ──
CREATE OR REPLACE FUNCTION admin_platform_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'labs',     (SELECT count(*) FROM labs),
      'active',   (SELECT count(*) FROM labs WHERE is_active),
      'suspended',(SELECT count(*) FROM labs WHERE NOT is_active),
      'trial',    (SELECT count(*) FROM labs WHERE plan='trial'),
      'users',    (SELECT count(*) FROM profiles WHERE lab_id IS NOT NULL),
      'orders',   (SELECT count(*) FROM work_orders),
      'clinics',  (SELECT count(*) FROM clinics)
    ),
    'plans', (SELECT COALESCE(jsonb_object_agg(plan, c), '{}'::jsonb) FROM (SELECT plan, count(*) c FROM labs GROUP BY plan) q),
    'attention', jsonb_build_object(
      'trial_ending_7d', (SELECT count(*) FROM labs WHERE plan='trial' AND trial_ends_at BETWEEN now() AND now()+interval '7 days'),
      'no_orders',       (SELECT count(*) FROM labs l WHERE NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.lab_id=l.id)),
      'silent_30d',      (SELECT count(*) FROM labs l WHERE EXISTS (SELECT 1 FROM work_orders w WHERE w.lab_id=l.id)
                            AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.lab_id=l.id AND w.created_at > now()-interval '30 days'))
    )
  ) INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION admin_platform_stats() TO authenticated;

-- ── Büyüme serisi (son 12 hafta) ──
CREATE OR REPLACE FUNCTION admin_growth_series()
RETURNS TABLE (week date, new_labs bigint, orders bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(date_trunc('week', now())-interval '11 weeks', date_trunc('week', now()), interval '1 week')::date AS wk
  )
  SELECT w.wk,
    (SELECT count(*) FROM labs l WHERE date_trunc('week', l.created_at)::date = w.wk),
    (SELECT count(*) FROM work_orders o WHERE date_trunc('week', o.created_at)::date = w.wk)
  FROM weeks w ORDER BY w.wk;
END $$;
GRANT EXECUTE ON FUNCTION admin_growth_series() TO authenticated;

-- ── Deneme uzat ──
CREATE OR REPLACE FUNCTION admin_extend_trial(p_lab uuid, p_days int)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v timestamptz;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_days < 1 OR p_days > 365 THEN RAISE EXCEPTION 'invalid days' USING errcode='22023'; END IF;
  UPDATE labs SET trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days)
    WHERE id=p_lab RETURNING trial_ends_at INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab not found' USING errcode='P0002'; END IF;
  INSERT INTO platform_audit_log(actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'extend_trial', p_lab, jsonb_build_object('days', p_days, 'new_end', v));
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION admin_extend_trial(uuid, int) TO authenticated;

-- ── Lab meta düzenle ──
CREATE OR REPLACE FUNCTION admin_update_lab_meta(p_lab uuid, p_name text, p_phone text, p_email text, p_address text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'name required' USING errcode='22023'; END IF;
  UPDATE labs SET name=btrim(p_name), phone=p_phone, email=p_email, address=p_address WHERE id=p_lab;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab not found' USING errcode='P0002'; END IF;
  INSERT INTO platform_audit_log(actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'update_meta', p_lab, jsonb_build_object('name', btrim(p_name)));
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION admin_update_lab_meta(uuid, text, text, text, text) TO authenticated;

-- ── Offboard (soft: pasifleştir + askıya al) ──
CREATE OR REPLACE FUNCTION admin_offboard_lab(p_lab uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  UPDATE labs SET is_active=false, plan='suspended' WHERE id=p_lab;
  IF NOT FOUND THEN RAISE EXCEPTION 'lab not found' USING errcode='P0002'; END IF;
  INSERT INTO platform_audit_log(actor_id, action, target_lab, detail)
  VALUES (auth.uid(), 'offboard', p_lab, '{}'::jsonb);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION admin_offboard_lab(uuid) TO authenticated;

-- ── Audit log (isimlerle) ──
CREATE OR REPLACE FUNCTION admin_audit_log(p_limit int DEFAULT 100)
RETURNS TABLE (id bigint, actor text, action text, lab_name text, detail jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  RETURN QUERY
  SELECT a.id, COALESCE(p.full_name, p.email, a.actor_id::text), a.action, l.name, a.detail, a.created_at
  FROM platform_audit_log a
  LEFT JOIN profiles p ON p.id = a.actor_id
  LEFT JOIN labs l ON l.id = a.target_lab
  ORDER BY a.id DESC LIMIT least(greatest(p_limit,1), 500);
END $$;
GRANT EXECUTE ON FUNCTION admin_audit_log(int) TO authenticated;

-- ── Platform admin yönetimi ──
CREATE OR REPLACE FUNCTION admin_list_platform_admins()
RETURNS TABLE (user_id uuid, name text, email text, note text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  RETURN QUERY
  SELECT pa.user_id, p.full_name, p.email, pa.note, pa.created_at
  FROM platform_admins pa LEFT JOIN profiles p ON p.id = pa.user_id
  ORDER BY pa.created_at;
END $$;
GRANT EXECUTE ON FUNCTION admin_list_platform_admins() TO authenticated;

CREATE OR REPLACE FUNCTION admin_add_platform_admin(p_email text, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  SELECT id INTO v_uid FROM profiles WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'user not found for email' USING errcode='P0002'; END IF;
  INSERT INTO platform_admins(user_id, note) VALUES (v_uid, p_note) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO platform_audit_log(actor_id, action, detail)
  VALUES (auth.uid(), 'add_platform_admin', jsonb_build_object('user_id', v_uid, 'email', p_email));
  RETURN v_uid;
END $$;
GRANT EXECUTE ON FUNCTION admin_add_platform_admin(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_remove_platform_admin(p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF (SELECT count(*) FROM platform_admins) <= 1 THEN
    RAISE EXCEPTION 'cannot remove the last platform admin' USING errcode='23514';
  END IF;
  DELETE FROM platform_admins WHERE user_id = p_user;
  INSERT INTO platform_audit_log(actor_id, action, detail)
  VALUES (auth.uid(), 'remove_platform_admin', jsonb_build_object('user_id', p_user));
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION admin_remove_platform_admin(uuid) TO authenticated;

-- ============================================================
-- END — platform F1 RPCs
-- ============================================================
