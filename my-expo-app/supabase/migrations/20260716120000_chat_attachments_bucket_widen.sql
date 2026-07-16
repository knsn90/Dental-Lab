-- chat-attachments bucket — canlı durumu 011b'nin beyanına geri çeker.
--
-- Sorun: 011b_order_messages_attachments.sql bucket'ı "100 MB, tüm MIME türleri"
-- (allowed_mime_types = NULL) olarak tanımlıyor, ama CANLI bucket 50 MB + dar bir
-- beyaz liste (yalnız jpeg/png/gif/webp, birkaç ses türü, pdf, doc/docx) idi.
-- 011b prod'a hiç uygulanmamış ya da sonradan panelden elle ezilmiş. Sonuç:
-- ataç menüsündeki "Dijital Tarama" (.stl/.ply/.obj/.step/.dcm) ve sürükle-bırak
-- ile gelen ZIP/HTML gibi dosyalar Storage tarafından sessizce reddediliyordu.
--
-- Karar (2026-07-16, kullanıcı onayı): allowed_mime_types = NULL — tür filtresi yok.
-- BİLİNÇLİ KABUL EDİLEN RİSK: bucket public:true ve politikası "oturum açmış herkes
-- yazabilir". Tür filtresi kalkınca yüklenen HTML, *.supabase.co altından public URL
-- ile ÇALIŞAN bir sayfa olarak servis edilir (oltalama yüzeyi). Risk siman.app
-- alan adında değil, Supabase alan adında. Bunu daraltmak istenirse tür beyaz
-- listesi değil, bucket'ı private + signed URL yapmak doğru çözümdür.
--
-- Boyut tavanı 100 MB, chatApi.ts'teki MAX_FILE_BYTES ile birebir aynı.

UPDATE storage.buckets
   SET file_size_limit    = 104857600,  -- 100 MB (100 * 1024 * 1024)
       allowed_mime_types = NULL        -- NULL = tüm MIME türlerine izin ver
 WHERE id = 'chat-attachments';
