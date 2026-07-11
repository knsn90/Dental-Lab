-- ════════════════════════════════════════════════════════════
-- pending_paper_orders — Klinikten gelen kağıt iş emri fotoğraflarının
-- OCR sonrası ön-kuyruğu. Lab onaylayınca gerçek work_orders'a aktarılır.
--
-- Akış:
--   1. Klinik fotoğrafı bir mesajlaşma kanalı üzerinden (WhatsApp Business / Twilio /
--      n8n / Zapier / direkt webhook) gönderir.
--   2. inbound-paper-order Edge Function gelen fotoğrafı parse-work-order'a yollar.
--   3. OCR sonucu bu tabloya yazılır, status='pending'.
--   4. Lab dashboardunda "Bekleyen Kağıt Siparişler" inbox'unda görünür.
--   5. Lab "Onayla" → /new-order'a OCR ile pre-fill ile gider.
--   6. Lab "Reddet" → status='rejected'.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pending_paper_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,

  -- Gelen kaynak bilgileri
  source          text NOT NULL CHECK (source IN ('whatsapp','telegram','email','webhook','manual','courier')),
  sender_phone    text,                                  -- Gönderen telefon (opsiyonel)
  sender_name     text,                                  -- Gönderen ad (mesajda varsa)
  channel_msg_id  text,                                  -- Gelen mesajın orijinal id'si (dedupe için)

  -- Medya
  photo_url       text,                                  -- Storage url'i
  photo_storage_path text,                               -- supabase storage path

  -- OCR çıktısı
  ocr_data        jsonb NOT NULL,                        -- parse-work-order JSON çıktısı
  clinic_id       uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
                                                         -- QR'dan veya telefonla eşleşmeden çözülmüş
  patient_name    text,                                  -- Hızlı listeleme için
  confidence_avg  numeric,                               -- 0-100 arası ortalama güven (UI sıralama için)

  -- Workflow
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','duplicate')),
  approved_work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  reject_reason   text,

  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_paper_orders_lab_status
  ON public.pending_paper_orders(lab_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_paper_orders_msg_id
  ON public.pending_paper_orders(channel_msg_id) WHERE channel_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_paper_orders_clinic
  ON public.pending_paper_orders(clinic_id) WHERE clinic_id IS NOT NULL;

-- RLS
ALTER TABLE public.pending_paper_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_paper_orders_read  ON public.pending_paper_orders;
DROP POLICY IF EXISTS pending_paper_orders_write ON public.pending_paper_orders;

CREATE POLICY pending_paper_orders_read ON public.pending_paper_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR p.lab_id = pending_paper_orders.lab_id)
    )
  );

CREATE POLICY pending_paper_orders_write ON public.pending_paper_orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR p.lab_id = pending_paper_orders.lab_id)
    )
  );

-- Edge Function SECURITY DEFINER ile (auth context yok) bu tabloya yazabilmeli.
-- service_role anahtarı zaten RLS'i bypass eder, bu yüzden extra policy gerekmez.

-- Storage bucket (zaten varsa atla)
INSERT INTO storage.buckets (id, name, public)
VALUES ('paper-orders', 'paper-orders', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — lab kullanıcısı kendi labının fotoğraflarını okur
DROP POLICY IF EXISTS "paper-orders-read" ON storage.objects;
CREATE POLICY "paper-orders-read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'paper-orders'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.user_type = 'admin' OR p.lab_id::text = (storage.foldername(name))[1])
    )
  );
