-- ============================================================================
-- Envanter Adım 0 — Profil hijyeni (denetimden ÖNCE gelmesi gereken düzeltme)
--
-- Denetim raporu (Adım 1) "beklenen miktar"ı profil kurallarından üretiyor.
-- Kural doğru olsa bile GİRDİSİ eksikse beklenen değer yanlış çıkar. Burada
-- yalnız isimden/referanstan TÜRETİLEBİLEN iki eksik kapatılıyor; sayısal
-- varsayım gerektiren kararlar (fire oranı, gr/diş miktarları) BU DOSYADA YOK.
--
-- 1) stock_items.thickness_mm — 90 kalemin HİÇBİRİNDE dolu değildi. disc_yield
--    modeli bu alan boşken 16 mm varsayıyor; 18/20/25 mm diskler olduğundan
--    büyük hesap sapması üretiyordu. Değer kalem ADINDAN okunuyor.
--    Frezeler (MILLING_BUR) KAPSAM DIŞI: onlardaki "mm" frez boyu, disk
--    kalınlığı değil — alanı kirletmemek için dokunulmuyor.
--
-- 2) disc_yield_ref — iki kalınlıkta satır yoktu, en yakın satıra düşülüyordu:
--    · ZIRCON_BLOCK 20 mm (7 aktif kalem) → 18 mm'ye düşüyordu (40 kron).
--      consumptionRef.ts "20-25 mm → 45-60 kron" diyor, ortası 52.5.
--    · PMMA_DISC 18 mm (1 aktif kalem) → 16 (35) ile 20 (45) arasında eşit
--      uzaklıkta kalıyor, hangisine düşeceği belirsizdi. İkisinin ortası 40.
--
-- Geri alma: thickness_mm tekrar NULL yapılabilir, eklenen iki referans satırı
-- silinebilir. Stok miktarına, harekete veya maliyete DOKUNULMUYOR.
-- ============================================================================

-- ── 1) Kalınlığı kalem adından doldur (yalnız disk/blok malzemeleri) ────────
UPDATE public.stock_items si
   SET thickness_mm = (regexp_match(si.name, '([0-9]{2})\s?-?\s?MM', 'i'))[1]::numeric,
       updated_at   = now()
  FROM public.production_materials pm
 WHERE pm.id = si.production_material_id
   AND pm.code IN ('ZIRCON_BLOCK', 'PMMA_DISC', 'GLASS_CERAMIC')
   AND si.thickness_mm IS NULL
   AND si.name ~* '([0-9]{2})\s?-?\s?MM';

-- ── 2) Eksik disk verimi satırları ─────────────────────────────────────────
INSERT INTO public.disc_yield_ref (material_code, thickness_mm, crowns_avg, label)
VALUES
  ('ZIRCON_BLOCK', 20, 52.5, '20 mm (20-25 mm bandı — consumptionRef)'),
  ('PMMA_DISC',    18, 40,   '18 mm (16 ve 20 mm arası — ara değer)')
ON CONFLICT (material_code, thickness_mm) DO NOTHING;
