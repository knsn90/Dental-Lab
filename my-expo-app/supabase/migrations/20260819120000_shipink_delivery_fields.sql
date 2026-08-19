-- ============================================================
-- 20260819120000 — Shipink kargo entegrasyonu için teslimat alanları
--
-- Shipink (kargo toplayıcı) gönderisinde iki AYRI kimlik var ve ikisi de lazım:
--   • takip numarası → external_tracking_no  (kullanıcı bununla takip eder)
--   • Shipink gönderi id'si → external_tracking_code (iptal/etiket çağrıları
--     bunu ister; takip numarası ile çağrılamaz)
-- Etiket (barkod) bağlantısı ise kutuya yapıştırılmak üzere tekrar tekrar
-- açılıyor; her seferinde API'ye gitmemek için kayda yazılır.
--
-- fee_source kısıtı yalnız ('banabikurye','manuel') idi; Shipink gönderi ücreti
-- API'den geldiği için 'shipink' değeri de kabul edilmeli — aksi halde ücret
-- yazılırken create_delivery CHECK ihlaliyle patlar.
--
-- Tümü ekleyici + nullable → mevcut satırlara ve RLS'e etkisi yok.
-- ============================================================
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS external_label_url TEXT;

COMMENT ON COLUMN public.deliveries.external_label_url IS
  'Dış kargo etiketi (barkod) bağlantısı — Shipink gönderi cevabındaki document.labels[0].pdf. Kutuya yapıştırılacak etiketi tekrar API''ye gitmeden açmak için.';

COMMENT ON COLUMN public.deliveries.external_tracking_code IS
  'Dış sağlayıcının KENDİ kayıt id''si (Shipink shipment id). İptal/etiket uçları bunu ister; müşteriye gösterilen takip numarası external_tracking_no.';

DO $$ BEGIN
  ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_source_chk;
  ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_fee_source_chk
    CHECK (fee_source IS NULL OR fee_source IN ('banabikurye','manuel','shipink'));
END $$;
