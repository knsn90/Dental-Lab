/**
 * layerMap — Filename → LayerType heuristic.
 *
 * Türkçe dental terminolojiye göre prefix matching. Dosya adında geçen ilk
 * keyword'e göre layer type'ı belirler. Type bilinmiyorsa 'other' döner.
 *
 * LayerType belirledikten sonra:
 *   • Default renk (cream / pearl / red translucent / vs.)
 *   • Stack pozisyonu (üst çene Y+, alt çene Y-, bite middle)
 *   • Sort order (panel listesinde sıralama)
 */

export type LayerType =
  | 'maxilla'        // Üst Çene
  | 'mandible'       // Alt Çene
  | 'bite'           // Bite / Kapanış
  | 'gingiva'        // Diş Eti Taraması
  | 'scanbody'       // Scan Body / Implant scan body
  | 'antagonist'     // Antagonist (karşı çene)
  | 'wax'            // Mum-up / wax-up
  | 'design'         // CAD design output
  | 'other';         // Bilinmeyen

interface LayerInfo {
  type: LayerType;
  /** Display name in layer panel */
  label: string;
  /** Default mesh color (hex) */
  color: string;
  /** Stack offset on Y axis (centered geometry → relative to origin) */
  yOffset: number;
  /** Panel sort priority (lower = top of list) */
  order: number;
  /** Default opacity (0-1) */
  opacity?: number;
}

const LAYER_DEFINITIONS: Record<LayerType, Omit<LayerInfo, 'type'>> = {
  // Klinik dental tonları — matte ivory + soft pink/blue
  maxilla:    { label: 'Üst Çene',         color: '#EFE4CC', yOffset: 8,    order: 1 },
  mandible:   { label: 'Alt Çene',         color: '#E3D5B8', yOffset: -8,   order: 2 },
  bite:       { label: 'Bite (Kapanış)',   color: '#7AAFE0', yOffset: 0,    order: 3, opacity: 0.42 },
  gingiva:    { label: 'Diş Eti Taraması', color: '#E89999', yOffset: 0,    order: 4, opacity: 0.68 },
  scanbody:   { label: 'Scan Body',        color: '#6B8FB8', yOffset: 0,    order: 5 },
  antagonist: { label: 'Antagonist',       color: '#C8B89E', yOffset: -8,   order: 6 },
  wax:        { label: 'Mum-Up',           color: '#EFC97A', yOffset: 0,    order: 7, opacity: 0.85 },
  design:     { label: 'Tasarım',          color: '#9ED3D3', yOffset: 0,    order: 8 },
  other:      { label: 'Diğer',            color: '#A8AEBA', yOffset: 0,    order: 99 },
};

/** Map normalized filename → LayerType. */
const KEYWORD_RULES: Array<{ pattern: RegExp; type: LayerType }> = [
  // Üst çene
  { pattern: /(\b|_)(maxilla|upper[\s_-]?jaw|ust[\s_-]?cene|üst[\s_-]?çene|maxiller|maks)/i, type: 'maxilla' },
  { pattern: /^(ust|üst)/i, type: 'maxilla' },
  // Alt çene
  { pattern: /(\b|_)(mandible|lower[\s_-]?jaw|alt[\s_-]?cene|alt[\s_-]?çene|mandibular|man)/i, type: 'mandible' },
  { pattern: /^(alt)/i, type: 'mandible' },
  // Bite / Kapanış
  { pattern: /(\b|_)(bite|occlusion|kapanis|kapanış|kapanis_kaydi)/i, type: 'bite' },
  // Diş eti
  { pattern: /(\b|_)(gingiva|gum|diseti|dis[\s_-]?eti|diş[\s_-]?eti|tissue)/i, type: 'gingiva' },
  // Scan body
  { pattern: /(\b|_)(scan[\s_-]?body|scanbody|sb|implant[\s_-]?scan)/i, type: 'scanbody' },
  // Antagonist
  { pattern: /(\b|_)(antagonist|opposing)/i, type: 'antagonist' },
  // Mum-up / wax-up
  { pattern: /(\b|_)(wax[\s_-]?up|mum[\s_-]?up|mockup|provizyon)/i, type: 'wax' },
  // Tasarım
  { pattern: /(\b|_)(design|crown|abutment|bridge|cad|kuron|köprü|dayanak)/i, type: 'design' },
];

export function detectLayerType(filename: string): LayerType {
  const name = filename.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(name)) return rule.type;
  }
  return 'other';
}

export function getLayerInfo(type: LayerType): LayerInfo {
  return { type, ...LAYER_DEFINITIONS[type] };
}

/**
 * exocad benzeri "her layer farklı renk" paleti — yüklenen dosya sırasına göre
 * her mesh'e ayırt edilebilir, canlı bir renk atanır (aynı-tür dosyalar bile
 * birbirinden ayrı görünür).
 */
export const LAYER_PALETTE: readonly string[] = [
  '#E8B84B', '#4FA3E3', '#E36B6B', '#5CC98C', '#B07CD9', '#E8923B',
  '#46C3C9', '#D96BA8', '#8FB14B', '#7C8CE0', '#D9C24B', '#5BB0A0',
];

/** Dosya index'ine göre paletten ayırt edilebilir renk (döngüsel). */
export function paletteColor(index: number): string {
  const n = LAYER_PALETTE.length;
  return LAYER_PALETTE[((index % n) + n) % n];
}

/** Convenience — file name → full layer config in one call. */
export function classifyFile(filename: string): LayerInfo {
  return getLayerInfo(detectLayerType(filename));
}
