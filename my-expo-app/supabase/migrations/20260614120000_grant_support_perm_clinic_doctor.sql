-- Denty "destek talebi açma" (destekTalebiAc) aracı can('manage_support') ile kilitli.
-- permissions tablosunda manage_support/view_support seed'liydi ama hiçbir rolde
-- grant yoktu → admin dışında kimse açamıyordu. Denty yalnızca doctor + clinic
-- panellerinde göründüğü için bu iki role destek izni veriyoruz.
--
-- Eklemeli + idempotent (role_permissions = role_key + permission_key).

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT v.role_key, v.permission_key
FROM (VALUES
  ('clinic_admin', 'manage_support'),
  ('clinic_admin', 'view_support'),
  ('doctor',       'manage_support'),
  ('doctor',       'view_support')
) AS v(role_key, permission_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role_key = v.role_key AND rp.permission_key = v.permission_key
);
