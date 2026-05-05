-- 070: Profil ek alanları — kişisel + mesleki bilgiler
-- KVKK kapsamında hassas veri: doğum tarihi, TC kimlik, adres

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date       date,
  ADD COLUMN IF NOT EXISTS gender           text CHECK (gender IN ('erkek','kadın','belirtilmedi')),
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS tc_kimlik_no     text,
  ADD COLUMN IF NOT EXISTS diploma_no       text,
  ADD COLUMN IF NOT EXISTS specialty        text,
  ADD COLUMN IF NOT EXISTS department       text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone   text,
  ADD COLUMN IF NOT EXISTS language         text DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS timezone         text DEFAULT 'Europe/Istanbul',
  ADD COLUMN IF NOT EXISTS kvkk_accepted_at timestamptz;

-- TC kimlik unique olsun (varsa)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_tc_kimlik
  ON profiles (tc_kimlik_no)
  WHERE tc_kimlik_no IS NOT NULL;

COMMENT ON COLUMN profiles.tc_kimlik_no IS 'KVKK kapsamında hassas veri — sadece kullanıcı kendisi görebilir';
COMMENT ON COLUMN profiles.birth_date   IS 'KVKK kapsamında hassas veri';
