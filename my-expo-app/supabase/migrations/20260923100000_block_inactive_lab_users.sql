-- Pasif (is_active = false) lab kullanıcısını RLS seviyesinde kapat.
--
-- SORUN: profiles.is_active giriş akışının hiçbir yerinde okunmuyordu; ne
-- LoginScreen'de, ne root guard'da, ne de RLS'te. Pasife alınmış bir teknisyen
-- normal e-posta/şifre ile girip tüm lab verisine erişebiliyordu (iOS'ta
-- gözlendi). Hekim/kliniği engelleyen kapı `approval_status`'tü; teknisyeni
-- pasife alan ekran o alana dokunmadığı için kapı hiç tetiklenmiyordu.
--
-- Burası ÜÇ katmanlı düzeltmenin DB ayağı: istemci guard'ı atlanabilir (anon
-- anahtarla doğrudan API çağrısı), asıl kapı RLS'te olmalı. is_lab_user()
-- lab/admin tipli TÜM politikaların temel yardımcısıdır; pasif kullanıcı
-- buradan itibaren hiçbir lab verisine erişemez.
--
-- COALESCE(is_active, true): kolon NULL kabul ediyor (default true). NULL'ı
-- "pasif" saymak, bayrağı hiç yazılmamış eski/ileride açılacak satırları
-- kilitlerdi — bilerek fail-open bırakıldı. (2026-09-23 itibarıyla 27 profilin
-- hiçbirinde NULL yok.)
--
-- Kendi profilini okuma politikası ("Own profile readable", auth.uid() = id)
-- bu fonksiyonu KULLANMAZ → pasif kullanıcı profilini hâlâ okuyabilir. Bu
-- bilinçli: istemci guard'ı is_active'i okuyup "hesabınız pasife alınmış"
-- mesajını gösterebilsin diye.

CREATE OR REPLACE FUNCTION public.is_lab_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND user_type IN ('lab', 'admin')
      AND COALESCE(is_active, true)
  );
$function$;
