export const WORK_TYPES = [
  'Zirkonyum Kron',
  'Zirkonyum Köprü',
  'Metal Destekli Porselen Kron',
  'Metal Destekli Porselen Köprü',
  'Tam Seramik Kron (e.max)',
  'Tam Seramik Köprü (e.max)',
  'İmplant Üstü Kron (Zirkonyum)',
  'İmplant Üstü Kron (Metal-Seramik)',
  'İnley / Onley',
  'Veneer',
  'Geçici Kron (3D Baskı)',
  'Geçici Köprü (3D Baskı)',
  'Cerrahi Şablon',
  'Hareketli Bölümlü Protez',
  'Tam Protez',
  'Gece Plağı',
  'Diğer',
] as const;

export type WorkType = (typeof WORK_TYPES)[number];
