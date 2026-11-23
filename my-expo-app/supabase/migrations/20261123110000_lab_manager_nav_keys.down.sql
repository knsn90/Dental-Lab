-- Geri alma: 20261123110000_lab_manager_nav_keys
-- view_support Nexadent lab ayarında zaten vardı — yalnız global satırı ve
-- view_scan_appointments satırlarını kaldırır.
DELETE FROM public.role_permissions
 WHERE role_key = 'lab_manager' AND lab_id IS NULL AND permission_key IN ('view_support','view_scan_appointments');
DELETE FROM public.role_permissions
 WHERE role_key = 'lab_manager' AND lab_id IS NOT NULL AND permission_key = 'view_scan_appointments';
