-- Kargo toplayıcının (Shipink) seçtiği gerçek taşıyıcı + müşteriye verilebilir takip bağlantısı.
--
-- Bugüne dek panelde yalnız "Shipink" görünüyordu: gönderi yanıtındaki taşıyıcı
-- (carrier.carrier_id) ve takip bağlantısı (tracking.url) hiç saklanmıyordu.
-- Takip numarası (tracking.id) da yanlış alandan okunduğu için boş kalıyordu;
-- o mevcut external_tracking_no sütununa yazılır (bu migration'la ilgisi yok).
--
-- Yalnız iki nullable sütun ekler; mevcut satırlar, RLS ve tetikleyiciler değişmez.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS external_carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS external_tracking_url TEXT;

COMMENT ON COLUMN public.deliveries.external_carrier_name IS
  'Toplayıcı üzerinden seçilen gerçek taşıyıcı (ör. "Kolay Gelsin"); external_provider toplayıcının kendisidir (Shipink).';
COMMENT ON COLUMN public.deliveries.external_tracking_url IS
  'Gönderinin herkese açık takip sayfası (Shipink: tracking.url).';
