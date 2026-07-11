import type { ReviewDimensionKey } from './types';

/** Değerlendirme boyutları — sıra, etiket, kısa açıklama (form + gösterim). */
export const REVIEW_DIMENSIONS: { key: ReviewDimensionKey; label: string; hint: string }[] = [
  { key: 'fit',       label: 'Marjinal Uyum',     hint: 'Kenar uyumu / pasiflik' },
  { key: 'occlusion', label: 'Oklüzyon',          hint: 'Kapanış / yükseklik' },
  { key: 'contacts',  label: 'Kontakt Noktaları', hint: 'Komşu diş teması' },
  { key: 'esthetics', label: 'Estetik / Renk',    hint: 'Renk ve form uyumu' },
  { key: 'surface',   label: 'Yüzey / Polisaj',   hint: 'Cila ve yüzey kalitesi' },
  { key: 'on_time',   label: 'Zamanında Teslim',  hint: 'Söz verilen tarihte' },
];
