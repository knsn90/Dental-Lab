-- Klinik logosu için clinics.logo_url alanı
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
