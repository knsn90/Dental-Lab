-- ============================================================================
-- Miktarsız akış öncesi profil boşluklarının kapatılması
--
-- Bayrak (lab_settings.inventory_qtyless_enabled) açıldığında teknisyen artık
-- miktar girmeyecek; miktarı profil hesaplayacak. Bu yüzden bayraktan ÖNCE
-- profilin cevap veremediği her kombinasyon kapatılmalı — yoksa teknisyenin
-- seçimi "profilsiz" olarak beklemede kalır ve stok düşmez.
--
-- Üç boşluk vardı:
--   1. Plak/geçici kron reçineleri "3D Yazıcı Modelaj"da seçilebilir görünüyordu
--   2. Model reçinesi kuralı ml, kalemlerden biri gr — çapraz ölçü ailesi
--   3. İki GC porselen kaleminde paket bilgisi yok — kural gr, kalem Adet
-- ============================================================================

-- ── 1) Reçineler doğru istasyona ────────────────────────────────────────────
-- Baskı "3D Baskı"da yapılıyor; "3D Yazıcı Modelaj" model işi için. Geçmiş
-- tüketim de bunu söylüyor: modelaj istasyonunda yalnız MODEL_RESIN görülmüş.
-- Kural yazmak yerine izin listesinden çıkarıyoruz — olmayan tüketim için
-- kural uydurmaktansa malzemeyi o istasyonda seçilemez yapmak doğru.
UPDATE public.production_materials
   SET allowed_stations = array_remove(allowed_stations, 'd8d3c75e-9467-475b-8864-25b7962bb66e'::uuid),
       updated_at = now()
 WHERE code IN ('SPLINT_RESIN', 'TEMP_RESIN');

-- ── 2) Model reçinesi: ölçü ailesi gr'a sabitleniyor ───────────────────────
-- İki kalem iki ayrı ailedeydi (RAYSHAPE ml, ANYCUBIC gr). convert_qty çapraz
-- aileyi çeviremediği için "39 ml" kuralı ANYCUBIC'te sessizce "39 gr" olarak
-- yazılacaktı. Reçine üreticileri verimi kütleyle yayınlıyor (SprintRay verim
-- tablosu gr) — ortak birim gr seçildi.
UPDATE public.stock_items
   SET unit = 'gr', updated_at = now()
 WHERE name ILIKE '%RAYSHAPE MODEL RE%' AND unit = 'ml';

UPDATE public.production_materials
   SET default_unit = 'gr', updated_at = now()
 WHERE code = 'MODEL_RESIN';

-- Değer de güncelleniyor: 39 ml, içi DOLU model varsayımıydı. SprintRay'in
-- kendi verim tablosu içi boşaltılmış model için 17.86 gr/model diyor.
-- İçi dolu basılıyorsa bu değer ~43 gr olmalı — kolayca değiştirilebilir.
UPDATE public.consumption_rules cr
   SET qty = 18, unit = 'gr',
       note = '[U] SprintRay Die & Model: 17.86 gr/model (icesi bosaltilmis baski). Ici DOLU basiliyorsa ~43 gr olmali.'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'MODEL_RESIN';

-- ── 3) GC lustre paste kalemleri ───────────────────────────────────────────
-- "ONE BODY CONCEPT LP NF G-23/G-36" gum shade lustre paste — üretici 4 g
-- kavanozda satıyor. Paket bilgisi girilince kural (gr) ile kalem (Adet)
-- arasındaki köprü kuruluyor. Kardeş 5 kalem zaten GLAZE'e bağlı; bunlar
-- PORCELAIN'de kalmıştı — lustre paste ince kat sürülür, porselen gibi
-- tabakalanmaz, o yüzden GLAZE'e alınıyor.
UPDATE public.stock_items si
   SET pack_size = 4, content_unit = 'gr',
       production_material_id = (SELECT id FROM public.production_materials
                                  WHERE code = 'GLAZE' AND lab_id = si.lab_id),
       updated_at = now()
 WHERE si.name ILIKE 'GC INİTİAL IQ, ONE BODY CONCEPT%'
   AND si.pack_size IS NULL;
