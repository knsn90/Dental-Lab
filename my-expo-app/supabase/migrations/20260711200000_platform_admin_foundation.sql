-- ============================================================
-- Super-admin (platform) foundation
--
-- platform_admins: SaaS sahibi/işletmecisi super-adminleri. Lab verisinden
-- TAMAMEN izole (lab user_type='admin' ≠ platform admin). Panel, lab verisine
-- yalnız SECURITY DEFINER admin_* RPC'leriyle erişir; lab RLS'ine dokunulmaz.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Platform admin kontrolü (DEFINER → RLS bypass, recursion yok)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;

-- Tabloyu yalnız platform adminleri OKUR; yazma yok (yalnız service role / RPC)
DROP POLICY IF EXISTS platform_admins_read ON platform_admins;
CREATE POLICY platform_admins_read ON platform_admins FOR SELECT USING (is_platform_admin());

-- İlk platform admin — Kaan Esen (lab sahibi + ürün sahibi)
INSERT INTO platform_admins (user_id, note)
VALUES ('f6817e96-2aab-443f-8cb3-02b7718f18e4', 'Founder — Kaan Esen')
ON CONFLICT (user_id) DO NOTHING;

-- İlk RPC: tüm lab'ları kullanım metrikleriyle listele (yalnız platform admin)
CREATE OR REPLACE FUNCTION admin_list_labs()
RETURNS TABLE (
  id uuid, name text, slug text, plan text, is_active boolean,
  trial_ends_at timestamptz, created_at timestamptz,
  users bigint, orders bigint, last_order_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT l.id, l.name, l.slug, l.plan, l.is_active, l.trial_ends_at, l.created_at,
    (SELECT count(*) FROM profiles p    WHERE p.lab_id = l.id),
    (SELECT count(*) FROM work_orders w WHERE w.lab_id = l.id),
    (SELECT max(w.created_at) FROM work_orders w WHERE w.lab_id = l.id)
  FROM labs l ORDER BY l.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION admin_list_labs() TO authenticated;

-- ============================================================
-- END — platform admin foundation
-- ============================================================
