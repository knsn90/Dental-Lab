/**
 * Tarama notları (3D kalem) — tip sözleşmesi.
 *
 * Noktalar MESH'İN KENDİ LOCAL UZAYINDA saklanır: viewer yüklediği mesh'leri
 * otomatik ortalayıp üst üste diziyor (auto-stack, offsetY, fit). Dünya uzayında
 * saklanan bir işaret, model bir daha yüklendiğinde havada kalırdı.
 *
 * Çapa `fileName` (dosya ADI) — id DEĞİL: ZIP modunda mesh id'leri oturum başına
 * üretiliyor ('zip-0'…), arşiv yeniden açıldığında sıra değişebilir.
 */

export type AnnotationKind = 'stroke' | 'arrow' | 'note';

/** [x, y, z] — mesh local uzayı, mm. */
export type Point3 = [number, number, number];

export interface AnnotationCamera {
  pos: Point3;
  target: Point3;
  fov?: number;
}

export interface ScanAnnotation {
  id: string;
  workOrderId: string;
  /** Çapalandığı mesh'in dosya adı; null = sahne geneli */
  fileName: string | null;
  kind: AnnotationKind;
  /** Hex (#RRGGBB) */
  color: string;
  /** Tüp yarıçapı — DÜNYA birimi (mm), ekran kalınlığı değil */
  width: number;
  points: Point3[];
  text: string | null;
  camera: AnnotationCamera | null;
  authorId: string | null;
  authorName: string | null;
  authorSide: 'lab' | 'clinic';
  createdAt: string;
}

export interface NewScanAnnotation {
  orderId: string;
  kind: AnnotationKind;
  points: Point3[];
  fileName?: string | null;
  color?: string;
  width?: number;
  text?: string | null;
  camera?: AnnotationCamera | null;
}

/** Kalem paleti — koyu/açık iki zeminde de okunur, status renkleriyle çakışmaz. */
export const PEN_COLORS = ['#DC2626', '#2563EB', '#16A34A', '#EA580C', '#7C3AED', '#0A0A0A'] as const;

/** Kalem kalınlıkları (tüp yarıçapı, mm). */
export const PEN_WIDTHS = [0.18, 0.35, 0.6] as const;
