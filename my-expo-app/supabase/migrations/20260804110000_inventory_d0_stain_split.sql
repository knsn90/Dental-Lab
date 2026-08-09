-- ============================================================================
-- Envanter Adım 0 (devam) — STAIN üretim malzemesi toz/likit olarak ayrılıyor
--
-- SORUN: tek "STAIN" malzemesinin kuralı gr cinsinden yazılmış, ama bağlı 7
-- kalemin 4'ü ml (Optiglaze 2.6/5 ml, EX-3 likit 10 ml). gr ile ml farklı ölçü
-- ailesi olduğu için miktar çevrilemiyor, kayıtlı ve beklenen değer
-- karşılaştırılamıyordu (denetim raporunda "birim uyuşmazlığı").
--
-- ÇÖZÜM: ml içerikli kalemler STAIN_LIQUID'e taşınır. Tek kural iki ölçü
-- ailesine hizmet etmeye çalışmaz.
--
-- KURAL YAZILMIYOR: STAIN_LIQUID için ml/diş değerini laboratuvar verecek.
-- O gelene kadar bu kalemler denetimde "kural yok" görünür — yanlış bir
-- varsayımla hesaplanmış sahte sapmadan iyidir.
--
-- Geri alma: kalemlerin production_material_id'si STAIN'e geri çevrilir,
-- STAIN_LIQUID satırı silinir. Stok/hareket/maliyet DEĞİŞMEZ.
-- ============================================================================

INSERT INTO public.production_materials
  (lab_id, code, name, default_unit, allowed_stations, consumption_behavior, is_active)
SELECT pm.lab_id, 'STAIN_LIQUID', 'Stain / Boya (likit)', 'ml',
       pm.allowed_stations, 'standard', true
  FROM public.production_materials pm
 WHERE pm.code = 'STAIN'
ON CONFLICT (lab_id, code) DO NOTHING;

-- Toz olanın adı da netleşsin — iki satır listede karışmasın
UPDATE public.production_materials
   SET name = 'Stain / Boya (toz)', updated_at = now()
 WHERE code = 'STAIN' AND name = 'Stain / Boya';

-- İçeriği hacim birimi olan kalemleri likit malzemeye taşı
UPDATE public.stock_items si
   SET production_material_id = liq.id, updated_at = now()
  FROM public.production_materials pm,
       public.production_materials liq
 WHERE pm.id = si.production_material_id
   AND pm.code = 'STAIN'
   AND liq.lab_id = pm.lab_id
   AND liq.code = 'STAIN_LIQUID'
   AND public.unit_family(si.content_unit) = 'volume';
