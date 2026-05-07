-- Expand profiles.role CHECK constraint to support all lab staff positions
-- New roles: accounting, courier, service, receptionist, intern

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN (
      'manager',       -- Mesul Müdür
      'technician',    -- Teknisyen
      'accounting',    -- Muhasebe
      'courier',       -- Kurye
      'service',       -- Hizmet Personeli
      'receptionist',  -- Resepsiyon / Sekreter
      'intern'         -- Stajyer
    ));
