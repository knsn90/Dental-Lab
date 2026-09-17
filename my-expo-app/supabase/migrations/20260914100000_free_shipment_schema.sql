-- 20260914100000_free_shipment_schema.sql
--
-- SERBEST GÖNDERİ — siparişe bağlı olmayan kurye/kargo kaydı.
--
-- Lab bazen işe bağlı olmayan bir şey gönderiyor: tedarikçiye iade, kliniğe
-- belge, şubeden malzeme alımı. Teslimat kaydı siparişe zorunlu bağlı olduğu
-- için bunlar ya hiç kaydedilmiyor ya ilgisiz bir siparişe iliştiriliyordu.
--
-- Serbest gönderi AYRI TABLO DEĞİL: deliveries kaydının work_order_id IS NULL
-- hâli. Böylece kurye paneli, canlı harita, durum akışı, GPS ve ücret→gider
-- tetikleyicisi tek kod yolundan çalışmaya devam eder.
--
-- Hepsi EKLEME; mevcut satırlar ve mevcut iki direction değeri dokunulmadan kalır.

ALTER TABLE public.deliveries ALTER COLUMN work_order_id DROP NOT NULL;

ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS shipment_no text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_shipment_no
  ON public.deliveries (lab_id, shipment_no) WHERE shipment_no IS NOT NULL;

-- Sipariş numarasıyla aynı desen (bkz. generate_order_number): lab + yıl başına sayaç.
CREATE TABLE IF NOT EXISTS public.shipment_number_counters (
  lab_id  uuid    NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  year    integer NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (lab_id, year)
);

-- Serbest gönderiye "labdan kliniğe" demek yön raporunu kirletir:
-- lab_to_other = labdan çıkan gönderi, other_to_lab = laba gelen alım.
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_direction_chk;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_direction_chk
  CHECK (direction IN ('lab_to_clinic','clinic_to_lab','lab_to_other','other_to_lab'));

COMMENT ON COLUMN public.deliveries.shipment_no IS
  'Siparişsiz gönderinin numarası (GND-YYYY-NNNN). Siparişli kayıtlarda NULL.';
