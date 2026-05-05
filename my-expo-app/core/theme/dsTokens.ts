/**
 * Design System tokens — Lab management handoff (handoff bundle)
 *
 *   3 panel teması:
 *     • lab    → Saffron + Krem
 *     • clinic → Sage + Koyu yeşil
 *     • exec   → Mercan + Krem
 *
 *   Tipografi: Instrument Serif (display) + Inter Tight/Geist (sans)
 *   Radius: 8-28 büyük yumuşak köşeler
 */

export const DS = {
  ink: {
    900: '#0A0A0A',
    800: '#1A1A1A',
    700: '#2C2C2C',
    500: '#6B6B6B',
    400: '#9A9A9A',
    300: '#D4D4D4',
    200: '#EAEAEA',
    100: '#F5F5F5',
    50:  '#FAFAFA',
  },

  lab: {
    name:        'Lab Paneli',
    bg:          '#F5EFD9',
    bgSoft:      '#FBF7E8',
    bgDeep:      '#E8DDB5',
    surface:     '#FFFFFF',
    surfaceAlt:  '#1A1A1A',
    primary:     '#F5C24B',
    primaryDeep: '#E0A82E',
    accent:      '#0A0A0A',
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  clinic: {
    name:        'Klinik Paneli',
    bg:          '#EDF2EE',
    bgSoft:      '#F5F8F5',
    bgDeep:      '#D9E5DC',
    surface:     '#FFFFFF',
    surfaceAlt:  '#0F2A1F',
    primary:     '#6BA888',
    primaryDeep: '#4D8A6B',
    accent:      '#0F2A1F',
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  exec: {
    name:        'Yönetim Paneli',
    bg:          '#F4ECE6',
    bgSoft:      '#FAF5F1',
    bgDeep:      '#E8D9CD',
    surface:     '#FFFFFF',
    surfaceAlt:  '#1A1A1A',
    primary:     '#E97757',
    primaryDeep: '#D15A3A',
    accent:      '#1A1A1A',
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  // Panel 4: TEKNİSYEN — Mavi tonları (üretim hattı / istasyon paneli)
  // Açık ve aydınlık mavi: yoğun ekran kullanımı için göz dostu, "iş yeri" hissi
  tech: {
    name:        'Teknisyen Paneli',
    bg:          '#EAF2FA',   // Açık gökyüzü mavisi
    bgSoft:      '#F4F8FC',   // Çok soluk
    bgDeep:      '#D2E1F0',   // Daha koyu (gradient ucu)
    surface:     '#FFFFFF',
    surfaceAlt:  '#0F2840',   // Koyu denim — kart bg + accent
    primary:     '#3B82F6',   // Parlak mavi (Tailwind blue-500)
    primaryDeep: '#1E5FBF',   // Koyu mavi (hover/active)
    accent:      '#0F2840',   // Koyu denim — CTA + kontrast
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  // Panel 5: PLUM — Erik / Lavanta tonları (analitik / raporlama paneli için ileride)
  // Yumuşak lavanta zemin + derin erik primary — "düşünme / odak" hissi
  plum: {
    name:        'Analitik Paneli',
    bg:          '#EFE9F5',   // Soluk lavanta
    bgSoft:      '#F7F3FA',   // Çok soluk
    bgDeep:      '#DDD0EA',   // Daha koyu (gradient ucu)
    surface:     '#FFFFFF',
    surfaceAlt:  '#2A1A3D',   // Koyu erik — kart bg + accent
    primary:     '#8B5CB8',   // Erik moru
    primaryDeep: '#6B3F94',   // Daha koyu erik (hover/active)
    accent:      '#2A1A3D',   // Koyu erik — CTA + kontrast
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  // Panel 6: TEAL — Petrol / Turkuaz tonları (depo / stok / lojistik paneli için ileride)
  // Soğuk ve berrak teal — "operasyon / akış" hissi, mavi paletten farklılaşır
  teal: {
    name:        'Depo Paneli',
    bg:          '#E4F1F0',   // Soluk petrol
    bgSoft:      '#F1F8F7',   // Çok soluk
    bgDeep:      '#C9E2DF',   // Daha koyu (gradient ucu)
    surface:     '#FFFFFF',
    surfaceAlt:  '#0E2E2C',   // Koyu petrol — kart bg + accent
    primary:     '#2BA39B',   // Parlak teal
    primaryDeep: '#197872',   // Koyu teal (hover/active)
    accent:      '#0E2E2C',   // Koyu petrol — CTA + kontrast
    success:     '#2D9A6B',
    warning:     '#E89B2A',
    danger:      '#D94B4B',
    info:        '#4A8FC9',
  },

  font: {
    // Display ve UI tek ailede — Inter Tight (Light 300 başlıklarda, Regular/Medium gövdede)
    display: '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    sans:    '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    mono:    '"JetBrains Mono", "IBM Plex Mono", monospace',
  },

  size: {
    display: 72, h1: 56, h2: 40, h3: 28, h4: 20,
    body: 15, small: 13, micro: 11,
  },

  radius: {
    sm: 8, md: 14, lg: 20, xl: 28, pill: 9999,
  },

  space: {
    1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
    8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
  },
} as const;

export type DsTheme = 'lab' | 'clinic' | 'exec' | 'tech' | 'plum' | 'teal';
export const dsTheme = (k: DsTheme) => DS[k];
