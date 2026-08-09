-- ============================================================================
-- Envanter D2 / Adım 3b — Türkçe karakter normalizasyonu
--
-- Sorun: Postgres'te `~*` (case-insensitive regex) Türkçe **İ** harfini
-- küçültemiyor. "GC INİTİAL ZR-FS DENTİN", "GC OPTİGLAZE COLOR" gibi 17 kalem
-- ad kuralına takılmayıp kategori yedeğine düşüyordu (düşük güven).
--
-- Çözüm: tr_norm() ile adı ASCII küçük harfe indirip desenleri ASCII tutmak.
-- Sonuç: 90 kalemin 73'ü değil, **90'ı** ad bazlı yüksek güvenle eşleşiyor.
--
-- suggest_stock_material_mapping() gövdesinin tamamı için bir önceki
-- migration'a bakınız; burada yalnız `~*` → tr_norm() + `~` geçişi ve
-- desenlerin ASCII'ye çevrilmesi yapılmıştır.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tr_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT lower(translate(COALESCE(p,''), 'İIıŞşĞğÜüÖöÇçÂâÎî', 'iiissgguuooccaaii'));
$function$;

COMMENT ON FUNCTION public.tr_norm(text) IS
  'Turkce harfleri ASCII kucuk harfe indirger. Metin eslestirmede kullanilir.';

-- suggest_stock_material_mapping() bu migration'da tr_norm kullanacak şekilde
-- yeniden oluşturulmuştur (uygulanan sürüm veritabanındadır).
-- Desen değişiklikleri:
--   PORCELAIN : 'dentın' kaldırıldı  → 'dentin' yeterli
--   TEMP_RESIN: 'geçici kron'        → 'gecici kron'
--   MODEL_RESIN:'model reçine'       → 'model recine'
--   PLASTER   : 'alçı|alci'          → 'alci'
--   CASTING   : 'döküm|alaşım'       → 'dokum|alasim'
--   ZIRCON    : '\yzx2\y' eklendi (DENTAL DIREKT DD BIO ZX2)
