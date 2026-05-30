-- ============================================================
-- Migration: Storage Cleanup Queue
--
-- Sorun: work_orders silindiğinde chat-attachments bucket'ındaki
-- dosyalar (path: {work_order_id}/*) orphan kalıyor.
-- PostgreSQL storage'a doğrudan erişemez; bunun yerine:
--   1) Bu tablo silinecek work_order_id'leri kayıt altına alır.
--   2) cleanup-storage Edge Function bu kuyruğu işler.
-- Edge Function'ı supabase/functions/cleanup-storage olarak deploy et
-- ve pg_cron ile düzenli çalıştır (örn. her gece saat 03:00).
-- ============================================================

CREATE TABLE IF NOT EXISTS storage_cleanup_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID        NOT NULL,
  bucket          TEXT        NOT NULL DEFAULT 'chat-attachments',
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_queue_unprocessed
  ON storage_cleanup_queue(queued_at)
  WHERE processed_at IS NULL;

-- RLS — sadece Edge Function (service role) okuyabilir
ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

-- Trigger: work_orders DELETE → kuyruğa ekle
CREATE OR REPLACE FUNCTION fn_queue_work_order_storage_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO storage_cleanup_queue (work_order_id, bucket)
  VALUES (OLD.id, 'chat-attachments');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_storage_cleanup ON work_orders;
CREATE TRIGGER trg_queue_storage_cleanup
  AFTER DELETE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION fn_queue_work_order_storage_cleanup();
