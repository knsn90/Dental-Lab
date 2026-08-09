// core/materials/stageCategories.ts
// Aşama ↔ malzeme-kategorisi ilişkisi (TEK KAYNAK).
// Kategoriler TÜRKÇE ve `stock_items.category` ile birebir; istasyon adları
// `lab_stations.name` ile birebir. Bu ilişki `lab_stations.allowed_material_types`
// üzerinden saklanır; İş Akışları > Aşama Kuralları'ndan düzenlenir. Buradaki
// STATION_CATEGORY_DEFAULTS yalnız migration'ın ilk doldurması + öneri içindir.

/** Çip seçici ve stok formu için canonical malzeme kategorileri (öneri). */
export const MATERIAL_CATEGORIES: string[] = [
  'Alçı',
  'Reçine',
  'Zirkonyum',
  'Cam Seramik Bloklar',
  'Freze',
  'Seramik',
  'Metal',
  'Mum',
  'Parlatma',
  'Temizlik',
  'Boyama',
  'Glaze',
];

/**
 * İstasyon adı → o aşamada kullanılma ihtimali olan kategoriler (varsayılan ilişki).
 * Bu haritada olan istasyonlar malzeme tüketir (consumes_materials = true).
 */
export const STATION_CATEGORY_DEFAULTS: Record<string, string[]> = {
  'Alçı Modelaj':       ['Alçı'],
  '3D Yazıcı Modelaj':  ['Reçine'],
  '3D Baskı':           ['Reçine'],
  'Frezeleme':          ['Zirkonyum', 'Cam Seramik Bloklar', 'Reçine', 'Freze'],
  'Metal Döküm':        ['Metal', 'Mum'],
  'Wash / Cure':        ['Temizlik'],
  'Porselen & Make-up': ['Seramik', 'Boyama'],
  'Glaze':              ['Seramik', 'Glaze'],
  'Polisaj':            ['Parlatma'],
};
