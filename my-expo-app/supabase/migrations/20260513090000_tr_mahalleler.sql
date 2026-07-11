-- ============================================================
-- 20260513090000 — Türkiye Mahalle Veritabanı (PTT bazlı)
--
--   tr_mahalleler tablosu — il/ilçe/mahalle + posta kodu.
--   Seed işlemi ayrı script ile yapılır (scripts/seed-mahalleler.ts).
--
--   RPC'ler:
--     • get_iller()            → [{il}]
--     • get_ilceler(p_il)      → [{ilce}]
--     • get_mahalleler(p_il, p_ilce) → [{mahalle, posta_kodu}]
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tr_mahalleler (
  id         BIGSERIAL PRIMARY KEY,
  il         TEXT NOT NULL,
  ilce       TEXT NOT NULL,
  mahalle    TEXT NOT NULL,
  posta_kodu TEXT,
  -- Hızlı arama için normalize edilmiş alanlar (lowercase, TR karakter)
  il_norm    TEXT GENERATED ALWAYS AS (lower(il))      STORED,
  ilce_norm  TEXT GENERATED ALWAYS AS (lower(ilce))    STORED,
  mah_norm   TEXT GENERATED ALWAYS AS (lower(mahalle)) STORED
);

CREATE INDEX IF NOT EXISTS idx_tr_mah_il        ON public.tr_mahalleler(il_norm);
CREATE INDEX IF NOT EXISTS idx_tr_mah_ilce      ON public.tr_mahalleler(il_norm, ilce_norm);
CREATE INDEX IF NOT EXISTS idx_tr_mah_mahalle   ON public.tr_mahalleler(il_norm, ilce_norm, mah_norm);
CREATE INDEX IF NOT EXISTS idx_tr_mah_pk        ON public.tr_mahalleler(posta_kodu) WHERE posta_kodu IS NOT NULL;

ALTER TABLE public.tr_mahalleler ENABLE ROW LEVEL SECURITY;

-- Herkes okur (referans veri)
DROP POLICY IF EXISTS tr_mahalleler_read ON public.tr_mahalleler;
CREATE POLICY tr_mahalleler_read ON public.tr_mahalleler FOR SELECT USING (true);

-- ─── RPC'ler ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_iller()
RETURNS TABLE(il TEXT)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m.il
    FROM public.tr_mahalleler m
   ORDER BY m.il;
$$;
GRANT EXECUTE ON FUNCTION public.get_iller() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_ilceler(p_il TEXT)
RETURNS TABLE(ilce TEXT)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m.ilce
    FROM public.tr_mahalleler m
   WHERE m.il_norm = lower(p_il)
   ORDER BY m.ilce;
$$;
GRANT EXECUTE ON FUNCTION public.get_ilceler(TEXT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_mahalleler(p_il TEXT, p_ilce TEXT)
RETURNS TABLE(mahalle TEXT, posta_kodu TEXT)
LANGUAGE sql STABLE AS $$
  SELECT m.mahalle, m.posta_kodu
    FROM public.tr_mahalleler m
   WHERE m.il_norm   = lower(p_il)
     AND m.ilce_norm = lower(p_ilce)
   ORDER BY m.mahalle;
$$;
GRANT EXECUTE ON FUNCTION public.get_mahalleler(TEXT, TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
