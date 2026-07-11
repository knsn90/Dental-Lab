/**
 * Denty AI orb — durum-temelli animasyon mimarisi.
 *
 * AIState: orb'un "canlı" davranışını belirler. ColorOrb tek bir animasyon
 * sürücüsüyle 4 durumu da uygular (rakip RAF/loop'lardan kaçınmak için
 * useIdle/useListening/useThinking/useSpeaking ayrı loop'lar yerine tek
 * parametre tablosu — düşük cihazda da 60fps).
 *
 * Yalnızca SUNUM katmanı; iş mantığı yok.
 */
export type AIState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface OrbStateParams {
  /** Işık şeritleri tam tur süresi (sn) — düşük = hızlı */
  spin: number;
  /** Yüzme genliği (viewBox birimi) */
  floatY: number;
  /** Yüzme + nefes döngü süresi (ms) */
  floatDur: number;
  /** Durağan ölçek (listening'de büyür) */
  scale: number;
  /** Çekirdek/halo nabzı opaklık aralığı */
  glowMin: number;
  glowMax: number;
  /** Nabız süresi (ms) — düşük = enerjik */
  pulseDur: number;
  /** Işık şeridi opaklığı */
  ribbon: number;
}

export const ORB_STATE: Record<AIState, OrbStateParams> = {
  idle:      { spin: 16, floatY: 3.5, floatDur: 4000, scale: 1.0,  glowMin: 0.5,  glowMax: 0.8,  pulseDur: 3200, ribbon: 0.85 },
  listening: { spin: 8,  floatY: 2.5, floatDur: 3000, scale: 1.07, glowMin: 0.7,  glowMax: 1.0,  pulseDur: 1300, ribbon: 1.0 },
  thinking:  { spin: 4.5,floatY: 2.0, floatDur: 2800, scale: 1.02, glowMin: 0.55, glowMax: 0.95, pulseDur: 950,  ribbon: 0.95 },
  speaking:  { spin: 7,  floatY: 4.0, floatDur: 2400, scale: 1.05, glowMin: 0.6,  glowMax: 1.0,  pulseDur: 560,  ribbon: 1.0 },
};
