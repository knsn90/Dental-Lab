-- ============================================================
-- 011b — order_messages attachment desteği
-- ============================================================
-- NOT: Bu dosya önceden "012_order_messages_attachments.sql" adıyla
-- duruyordu; aynı numarada (012) "012_multi_tenancy.sql" da bulunduğu
-- için fresh install'da alfabetik sıralama çakışıyordu.
-- 011'in mantıksal uzantısı olduğundan 011b'ye yeniden adlandırıldı.
-- Production'da daha önce 012 adıyla uygulanmışsa, içerik idempotent
-- olduğundan yeniden çalıştırma güvenlidir.
-- ============================================================

-- 1) order_messages tablosuna attachment kolonları ekle
ALTER TABLE order_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,   -- 'image' | 'audio' | 'file'
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size  INTEGER;

-- 2) chat-attachments storage bucket (100 MB, tüm MIME türleri)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  104857600,   -- 100 MB (100 * 1024 * 1024)
  NULL         -- NULL = tüm MIME türlerine izin ver
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = 104857600,
      allowed_mime_types = NULL;

-- 3) Storage policies — idempotent (re-run güvenli)
DROP POLICY IF EXISTS "chat_attach_insert" ON storage.objects;
CREATE POLICY "chat_attach_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "chat_attach_select" ON storage.objects;
CREATE POLICY "chat_attach_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
