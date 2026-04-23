-- ============================================================
-- 020 — Lab Letterhead (Teslimat Fişi için)
-- ============================================================
-- labs tablosuna teslimat fişi başlığında kullanılacak iletişim
-- alanlarını ekler: adres, telefon, vergi no, logo URL, web sitesi.
-- Default Esen Dental Lab kaydı placeholder değerlerle güncellenir.
-- İleride lab ayarları ekranından düzenlenebilir.
-- Idempotent.
-- ============================================================

ALTER TABLE labs ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS logo_url   TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS website    TEXT;

-- Default lab için placeholder iletişim bilgileri
-- (Gerçek değerler lab ayarları ekranından girilecek)
UPDATE labs
   SET phone   = COALESCE(phone,   '+90 (000) 000 00 00'),
       email   = COALESCE(email,   'info@esenkim.com'),
       website = COALESCE(website, 'lab.esenkim.com'),
       address = COALESCE(address, '')
 WHERE id = '00000000-0000-0000-0000-000000000001';
