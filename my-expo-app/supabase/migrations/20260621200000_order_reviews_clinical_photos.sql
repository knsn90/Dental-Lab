-- Ağız içi (klinik) fotoğraflar — bitmiş işin hastanın ağzındaki hâli; lab için pazarlama değeri yüksek.
-- Genel fotoğraflardan (photos) ayrı tutulur ki lab kolayca filtreleyebilsin.
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS clinical_photos text[] NOT NULL DEFAULT '{}';
