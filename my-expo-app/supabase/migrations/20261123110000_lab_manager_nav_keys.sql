-- Menü öğeleri yetki anahtarlarına bağlanıyor (Destek → view_support,
-- Tarama Randevuları → view_scan_appointments). Bugün bu iki menü yetkiden
-- bağımsız görünüyor; bağlanınca kaybolmasınlar diye lab_manager rolüne
-- (global + lab'a özel ayarlı satırlar) bu iki anahtar eklenir.
-- Yalnız EKLER; hiçbir satır silinmez/değişmez.

INSERT INTO public.permissions (key, label, category)
VALUES ('view_scan_appointments', 'Tarama Randevuları — Görme', 'module')
ON CONFLICT (key) DO NOTHING;

-- Global lab_manager
INSERT INTO public.role_permissions (role_key, permission_key, lab_id)
SELECT 'lab_manager', k, NULL
  FROM unnest(ARRAY['view_support','view_scan_appointments']) AS k
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_key = 'lab_manager' AND rp.permission_key = k AND rp.lab_id IS NULL);

-- Lab'a özel lab_manager ayarı olan lab'lar
INSERT INTO public.role_permissions (role_key, permission_key, lab_id)
SELECT 'lab_manager', k, o.lab_id
  FROM public.lab_role_permission_overrides o
 CROSS JOIN unnest(ARRAY['view_support','view_scan_appointments']) AS k
 WHERE o.role_key = 'lab_manager'
   AND NOT EXISTS (
     SELECT 1 FROM public.role_permissions rp
      WHERE rp.role_key = 'lab_manager' AND rp.permission_key = k AND rp.lab_id = o.lab_id);
