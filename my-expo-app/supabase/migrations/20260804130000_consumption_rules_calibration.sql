-- ============================================================================
-- Tüketim kurallarının kalibrasyonu — araştırma sonucu
--
-- Üretici belgeleri gr/diş veya ml/diş vermiyor (GC, Kuraray/Noritake, Ivoclar
-- IFU'larında tüketim değeri yok — arandı, yayınlanmıyor). Bu yüzden iki
-- kaynak kullanıldı ve her kural NEREDEN geldiğini `note` alanında taşıyor:
--
--   [S] Sektör verisi  — yayınlanmış ortalamalar
--   [T] Türetilmiş     — yüzey alanı × film kalınlığı × yoğunluk + fire payı
--
-- HİÇBİRİ BU LABORATUVARDA ÖLÇÜLMÜŞ DEĞİLDİR. Gerçek değer, envanter
-- doğrulaması (D3) ile ortaya çıkar: bir kavanoz açılışta ve bitişte sayılır,
-- aradaki diş sayısına bölünür. Bu kurallar o ölçüme kadar geçerli başlangıç
-- değerleridir.
--
-- Kural değişikliği BUGÜNKÜ teknisyen akışını etkilemez — o akış hâlâ
-- stock_items.units_per_tooth üzerinden çalışıyor. Etkilediği yerler:
-- denetim raporundaki "beklenen" değer, düzeltme RPC'si ve miktarsız akış.
-- ============================================================================

-- ── Frez: 0.025 → 0.008 adet/diş ───────────────────────────────────────────
-- [S] Zirkonya frezlerinin yayınlanmış ömrü 100-150 ünite (DLC kaplı 150-200).
-- Eski değer 40 dişte 1 frez demekti — sektör ortalamasının ~3 katı tüketim.
UPDATE public.consumption_rules cr
   SET qty = 0.008, is_assumption = false,
       note = '[S] Frez omru 100-150 unite (DLC 150-200) — 125 dis/frez alindi'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'MILLING_BUR';

-- ── Alçı: 0.35 → 0.25 kg/çene ──────────────────────────────────────────────
-- [S] Model dökümü 100-150 gr + baz dökümü 100-150 gr = 200-300 gr/çene.
UPDATE public.consumption_rules cr
   SET qty = 0.25, is_assumption = false,
       note = '[S] Model dokumu 100-150 gr + baz 100-150 gr = 200-300 gr/cene'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'PLASTER';

-- ── Glaze: 0.1 → 0.05 gr/diş ───────────────────────────────────────────────
-- [T] Kron dış yüzeyi ~2 cm² × ~60 µm yaş film × ~2 g/cm³ ≈ 0.025 gr;
-- palet artığı ve fire için ~2 kat → 0.05 gr. 5 gr kavanoz ≈ 100 diş.
UPDATE public.consumption_rules cr
   SET qty = 0.05, is_assumption = false,
       note = '[T] ~2 cm2 x ~60 um x ~2 g/cm3 + fire payi; 5 gr kavanoz ~100 dis'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'GLAZE';

-- ── Stain (toz): 0.05 → 0.01 gr/diş ────────────────────────────────────────
-- [T] Boya tüm yüzeye değil, karakterizasyon bölgelerine (fissür, servikal,
-- insizal) sürülür — glaze'in ~beşte biri. 3 gr kavanoz ≈ 300 diş.
UPDATE public.consumption_rules cr
   SET qty = 0.01, is_assumption = false,
       note = '[T] Yuzeyin ~1/5''ine karakterizasyon; 3 gr kavanoz ~300 dis'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'STAIN';

-- ── Stain (likit): yeni kural 0.03 ml/diş ──────────────────────────────────
-- [T] Fırça ile kaplayıcı ince kat: ~2 cm² × ~60 µm ≈ 0.012 ml + fırça/şişe
-- artığı → 0.03 ml. 2.6 ml şişe ≈ 85 diş.
-- station_id NULL: malzeme zaten yalnız Glaze ve Porselen & Make-up'ta
-- seçilebiliyor (allowed_stations), kural ikisinde de geçerli olsun.
INSERT INTO public.consumption_rules
  (version_id, station_id, production_material_id, calc_model, qty, unit,
   conditions, sort_order, is_assumption, note)
SELECT v.id, NULL, pm.id, 'per_tooth', 0.03, 'ml', '{}'::jsonb, 100, false,
       '[T] ~2 cm2 x ~60 um + firca artigi; 2.6 ml sise ~85 dis'
  FROM public.production_materials pm
  JOIN public.consumption_profiles p ON p.lab_id = pm.lab_id AND NOT p.is_template
  JOIN public.consumption_profile_versions v ON v.profile_id = p.id AND v.status = 'active'
 WHERE pm.code = 'STAIN_LIQUID'
   AND NOT EXISTS (
     SELECT 1 FROM public.consumption_rules cr
      WHERE cr.version_id = v.id AND cr.production_material_id = pm.id);

-- ── Model reçinesi: 3D Yazıcı Modelaj istasyonu da kapsansın ───────────────
-- Kural yalnız "3D Baskı" için yazılmıştı; malzeme iki istasyonda da
-- seçilebiliyor ve geçmiş kayıtlar 3D Yazıcı Modelaj'da tüketim gösteriyor.
INSERT INTO public.consumption_rules
  (version_id, station_id, production_material_id, calc_model, qty, unit,
   conditions, sort_order, is_assumption, note)
SELECT cr.version_id, 'd8d3c75e-9467-475b-8864-25b7962bb66e'::uuid,
       cr.production_material_id, cr.calc_model, cr.qty, cr.unit,
       cr.conditions, cr.sort_order, cr.is_assumption,
       'Ayni kural — 3D Yazici Modelaj istasyonu icin kopyalandi'
  FROM public.consumption_rules cr
  JOIN public.production_materials pm ON pm.id = cr.production_material_id
 WHERE pm.code = 'MODEL_RESIN'
   AND cr.station_id = 'b21c0271-e4d6-469a-ad55-d831928c7eb1'
   AND NOT EXISTS (
     SELECT 1 FROM public.consumption_rules x
      WHERE x.version_id = cr.version_id
        AND x.production_material_id = cr.production_material_id
        AND x.station_id = 'd8d3c75e-9467-475b-8864-25b7962bb66e');
