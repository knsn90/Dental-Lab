-- get_my_permissions: rol izinleri + KULLANICI-BAZLI override birleşimi.
-- Önceki sürüm yalnız role_permissions okuyordu; user_permissions override'ları
-- (Yönetici → Yetkiler → Kullanıcı Bazlı) runtime'da yok sayılıyordu. Bu migration
-- override'ları (grant ∪ / revoke ∖) de hesaba katar.

-- Kullanıcı-bazlı izin override tablosunu güvene al (canlıda mevcut; yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id        uuid NOT NULL,
  permission_key text NOT NULL,
  granted        boolean NOT NULL DEFAULT true,
  granted_by     uuid,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

-- Dönüş tipi değişebileceği için önce kaldır (CREATE OR REPLACE yetmiyor)
DROP FUNCTION IF EXISTS get_my_permissions();

CREATE FUNCTION get_my_permissions()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT pk ORDER BY pk), '{}'::TEXT[])
  FROM (
    SELECT rp.permission_key AS pk
    FROM role_permissions rp
    WHERE rp.role_key = my_role_key()
    UNION
    SELECT up.permission_key AS pk
    FROM user_permissions up
    WHERE up.user_id = auth.uid() AND up.granted = true
  ) base
  WHERE pk NOT IN (
    SELECT up2.permission_key
    FROM user_permissions up2
    WHERE up2.user_id = auth.uid() AND up2.granted = false
  )
$$;
