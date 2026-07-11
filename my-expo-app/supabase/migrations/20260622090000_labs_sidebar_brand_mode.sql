-- Sidebar marka gösterimi: 'logo_text' (logo + isim) veya 'logo' (sadece büyük logo). Varsayılan logo_text.
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS sidebar_brand_mode text NOT NULL DEFAULT 'logo_text'
  CHECK (sidebar_brand_mode IN ('logo', 'logo_text'));
