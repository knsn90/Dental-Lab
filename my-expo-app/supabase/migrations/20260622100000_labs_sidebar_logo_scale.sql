-- Sidebar logo ölçeği (büyüt/küçült). 1.0 = varsayılan; UI 0.6–1.8 aralığında ayarlar.
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS sidebar_logo_scale numeric NOT NULL DEFAULT 1.0
  CHECK (sidebar_logo_scale >= 0.4 AND sidebar_logo_scale <= 2.5);
