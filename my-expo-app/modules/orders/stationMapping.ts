// modules/orders/stationMapping.ts
// SINGLE SOURCE OF TRUTH for station_name → Stage mapping.
// Do NOT scatter substring logic across components.
//
// Short term: client-side substring match (fast, no migration).
// Later: replace with a `current_stage` column on v_active_orders_kanban.

import { STAGE_ORDER, type Stage } from './stages';

/** All Stage tokens we'll match against, ordered most-specific first. */
const STAGE_TOKENS: Stage[] = [
  'MANAGER_REVIEW',
  'DOCTOR_APPROVAL',
  'TRIAGE',
  'DESIGN',
  'CAM',
  'MILLING',
  'SINTER',
  'FINISH',
  'QC',
  'SHIPPED',
];

/** Gerçek istasyon adları TÜRKÇE; token listesi İNGİLİZCE idi, yani üretimdeki
 *  17 istasyonun neredeyse hiçbiri eşleşmiyor, hepsi fallback'e düşüyordu.
 *  (DB'den okunan adlar: Tarama, CAD Tasarım, CAM Hazırlık, Frezeleme,
 *  Sinterleme, Porselen & Make-up, Glaze, Polisaj, Kalite Kontrol, Paketleme,
 *  Teslime Hazır, Alçı Modelaj, 3D Baskı, 3D Yazıcı Modelaj, Metal Döküm,
 *  İmplant Montajı, Wash / Cure.) */
const TR_ALIASES: { needle: string; stage: Stage }[] = [
  { needle: 'TARAMA',        stage: 'TRIAGE'  },
  { needle: 'ALÇI',          stage: 'TRIAGE'  },
  { needle: 'ALCI',          stage: 'TRIAGE'  },
  { needle: '3D BASKI',      stage: 'MILLING' },
  { needle: '3D YAZICI',     stage: 'MILLING' },
  { needle: 'TASARIM',       stage: 'DESIGN'  },
  { needle: 'MODELAJ',       stage: 'DESIGN'  },
  { needle: 'HAZIRLIK',      stage: 'CAM'     },
  { needle: 'FREZE',         stage: 'MILLING' },
  { needle: 'DÖKÜM',         stage: 'MILLING' },
  { needle: 'DOKUM',         stage: 'MILLING' },
  { needle: 'SİNTER',        stage: 'SINTER'  },
  { needle: 'SINTER',        stage: 'SINTER'  },
  { needle: 'WASH',          stage: 'SINTER'  },
  { needle: 'CURE',          stage: 'SINTER'  },
  { needle: 'PORSELEN',      stage: 'FINISH'  },
  { needle: 'MAKE-UP',       stage: 'FINISH'  },
  { needle: 'GLAZE',         stage: 'FINISH'  },
  { needle: 'POLİSAJ',       stage: 'FINISH'  },
  { needle: 'POLISAJ',       stage: 'FINISH'  },
  { needle: 'İMPLANT',       stage: 'FINISH'  },
  { needle: 'IMPLANT',       stage: 'FINISH'  },
  { needle: 'KALİTE',        stage: 'QC'      },
  { needle: 'KALITE',        stage: 'QC'      },
  { needle: 'PAKETLEME',     stage: 'SHIPPED' },
  { needle: 'TESLİM',        stage: 'SHIPPED' },
  { needle: 'TESLIM',        stage: 'SHIPPED' },
];

/** Eşleşmeyen istasyon adları — uyarı AD BAŞINA BİR KEZ basılır. Eskiden her
 *  çağrıda basılıyordu: tek sayfa açılışında yüzlerce console.warn, DevTools
 *  açıkken her biri yığın izi üretiyor ve sayfayı gözle görülür kilitliyordu. */
const warnedStations = new Set<string>();

/**
 * Map a station_name → Stage. Falls back to 'TRIAGE' when nothing matches.
 *
 * @param stationName  Raw station label (case-insensitive).
 * @param fallback     Override default fallback if needed.
 */
export function mapStationToStage(
  stationName: string | null | undefined,
  fallback: Stage = 'TRIAGE',
): Stage {
  if (!stationName) return fallback;
  const upper = stationName.toLocaleUpperCase('tr');
  const match = STAGE_TOKENS.find(s => upper.includes(s))
    ?? TR_ALIASES.find(a => upper.includes(a.needle))?.stage;
  if (!match) {
    if (typeof console !== 'undefined' && !warnedStations.has(upper)) {
      warnedStations.add(upper);
      console.warn(`[mapStationToStage] eşleşmeyen istasyon: "${stationName}" → ${fallback}`);
    }
    return fallback;
  }
  return match;
}

/** Production stages used in the Kanban (TRIAGE → SHIPPED, DOCTOR_APPROVAL excluded as bench column). */
export const KANBAN_STAGES: Stage[] = [
  'TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC',
];
