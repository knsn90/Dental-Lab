-- Aşama ↔ malzeme-kategorisi ilişkisini Türkçe kategori sözlüğüne taşı.
-- Önceki durum: lab_stations.allowed_material_types İngilizce anahtarlar
-- (zirconia/pmma/porcelain…) tutuyordu ama stock_items.category Türkçe
-- (Zirkonyum/Seramik/Alçı…) → eşleşme hiç tutmuyordu, ilişki fiilen kopuktu.
-- Bu migration istasyonların izinli kategorilerini gerçek TR kategorilere çevirir
-- ve tüketen aşamaları (Alçı Modelaj dahil) düzeltir. İlişki İş Akışları >
-- Aşama Kuralları'ndan düzenlenebilir; buradaki değerler yalnız varsayılan.

with m(name, cats) as (values
  ('Alçı Modelaj',       array['Alçı']),
  ('3D Yazıcı Modelaj',  array['Reçine']),
  ('3D Baskı',           array['Reçine']),
  ('Frezeleme',          array['Zirkonyum','Cam Seramik Bloklar','Reçine','Freze']),
  ('Metal Döküm',        array['Metal','Mum']),
  ('Wash / Cure',        array['Temizlik']),
  ('Porselen & Make-up', array['Seramik','Boyama']),
  ('Glaze',              array['Seramik','Glaze']),
  ('Polisaj',            array['Parlatma'])
)
update lab_stations ls
set allowed_material_types = m.cats,
    consumes_materials = true
from m
where ls.name = m.name;

-- Hiçbir istasyon adına karşılık gelmeyen ölü toplu-default etiketini temizle.
update stock_items set consume_at_stage = null where consume_at_stage = 'MILLING';
