-- Medit Link patient registry — uuid → name lookup
-- Medit case body'sinde sadece patient.uuid var; isim ayrı patient.* event'lerinde gelir.

CREATE TABLE IF NOT EXISTS public.medit_patients (
  uuid          TEXT PRIMARY KEY,
  name          TEXT,
  code          TEXT,
  date_created  TIMESTAMPTZ,
  date_updated  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medit_patients_name ON public.medit_patients(LOWER(name));

NOTIFY pgrst, 'reload schema';
