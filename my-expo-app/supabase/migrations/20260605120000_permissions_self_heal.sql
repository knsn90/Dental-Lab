-- ============================================================
-- Yetki kaydı FK hatası düzeltmesi.
-- SORUN: app yetki kataloğu (permissionStore) büyüdü ama DB 'permissions'
-- tablosu eski → katalogdaki yeni view_/manage_ anahtarları DB'de yok →
-- set_role_permissions INSERT'i role_permissions.permission_key FK'sini ihlal ediyor.
--
-- ÇÖZÜM:
--   1) Bilinen eksik anahtarları seed et (güzel TR etiketle).
--   2) set_role_permissions'ı SELF-HEALING yap: atanan her anahtarı, yoksa
--      'permissions'a otomatik ekle (katalog ilerde büyürse tekrar bozulmaz).
-- Görünen etiket app PERMISSION_LABELS'ten gelir; DB label sadece referans.
-- ============================================================

INSERT INTO public.permissions (key, label, category) VALUES
  ('view_expenses',     'Giderler (Görüntüleme)',     'page'),
  ('view_checks',       'Çek & Senet (Görüntüleme)',  'page'),
  ('view_cash',         'Kasa & Banka (Görüntüleme)', 'page'),
  ('view_pricelist',    'Fiyat Listesi (Görüntüleme)','page'),
  ('view_budget',       'Bütçe (Görüntüleme)',        'page'),
  ('view_couriers',     'Kuryeler (Görüntüleme)',     'page'),
  ('manage_stock_cost', 'Stok Maliyet (Yönetim)',     'action')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_role_permissions(p_role text, p_permissions text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF my_user_type() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can modify permissions';
  END IF;

  -- Self-healing: atanan anahtarlar 'permissions'da yoksa otomatik ekle (FK ihlali olmasın)
  INSERT INTO permissions (key, label, category)
  SELECT k,
    initcap(replace(regexp_replace(k, '^(view|manage)_', ''), '_', ' ')) ||
      CASE WHEN left(k,7)='manage_' THEN ' (Yönetim)'
           WHEN left(k,5)='view_'   THEN ' (Görüntüleme)' ELSE '' END,
    CASE WHEN left(k,5)='view_' THEN 'page' ELSE 'action' END
  FROM unnest(p_permissions) AS k
  ON CONFLICT (key) DO NOTHING;

  DELETE FROM role_permissions
   WHERE role_key = p_role AND permission_key <> ALL(p_permissions);

  INSERT INTO role_permissions (role_key, permission_key)
  SELECT p_role, unnest(p_permissions)
  ON CONFLICT (role_key, permission_key) DO NOTHING;
END;
$function$;
