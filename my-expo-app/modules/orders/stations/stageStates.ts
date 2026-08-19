// modules/orders/stations/stageStates.ts
// Stage status enum'unun her değeri için UI metadata: label, color, icon, badge tonu.
// DB enum (stage_status): bekliyor, aktif, tamamlandi, onaylandi, reddedildi,
//                         skipped, durakladi, makine_bekliyor, onay_bekliyor,
//                         bloklu, yeniden

import type { LucideIcon } from 'lucide-react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import {
  Clock, Play, Pause, Check, ShieldCheck, AlertOctagon, Cog, Hourglass, RotateCcw, SkipForward,
} from 'lucide-react-native';

export type StageStatus =
  | 'bekliyor'
  | 'aktif'
  | 'durakladi'
  | 'makine_bekliyor'
  | 'onay_bekliyor'
  | 'bloklu'
  | 'yeniden'
  | 'tamamlandi'
  | 'onaylandi'
  | 'reddedildi'
  | 'skipped';

export interface StageStateMeta {
  label:    string;       // Türkçe insan-okur etiket
  short:    string;       // Compact pill için kısa etiket
  color:    string;       // foreground hex
  bgTint:   string;       // background tint (hex with rgba alpha applied externally)
  icon:     LucideIcon;
  /** Operatör aktif çalışıyor mu? (timing UI için) */
  isWorking: boolean;
  /** Pause/blocked benzeri kullanıcı aksiyonu beklenen state mi? */
  isPaused:  boolean;
}

export const STAGE_STATE_META: Record<StageStatus, StageStateMeta> = {
  bekliyor: {
    label: 'Sıra Bekliyor', short: 'BEKLİYOR',
    color: '#6B6B6B', bgTint: '#F0EFEB',
    icon: Clock, isWorking: false, isPaused: false,
  },
  aktif: {
    label: 'Aktif Çalışılıyor', short: 'AKTİF',
    color: '#3B82F6', bgTint: '#EAF2FA',
    icon: Play, isWorking: true, isPaused: false,
  },
  durakladi: {
    label: 'Durakladı', short: 'DURAKLADI',
    color: '#B5752A', bgTint: '#FEF3C7',
    icon: Pause, isWorking: false, isPaused: true,
  },
  makine_bekliyor: {
    label: 'Makine Bekleniyor', short: 'MAKİNE',
    color: '#0891B2', bgTint: '#CFFAFE',
    icon: Cog, isWorking: false, isPaused: true,
  },
  onay_bekliyor: {
    label: 'Onay Bekleniyor', short: 'ONAY',
    color: '#7C3AED', bgTint: '#EDE9FE',
    icon: Hourglass, isWorking: false, isPaused: true,
  },
  bloklu: {
    label: 'Bloklu', short: 'BLOKLU',
    color: '#DC2626', bgTint: '#FEE2E2',
    icon: AlertOctagon, isWorking: false, isPaused: true,
  },
  yeniden: {
    label: 'Yeniden Yapılıyor', short: 'YENİDEN',
    color: '#EA580C', bgTint: '#FED7AA',
    icon: RotateCcw, isWorking: false, isPaused: true,
  },
  tamamlandi: {
    label: 'Tamamlandı', short: 'TAMAM',
    color: '#059669', bgTint: '#D1FAE5',
    icon: Check, isWorking: false, isPaused: false,
  },
  onaylandi: {
    label: 'Onaylandı', short: 'ONAYLI',
    color: '#059669', bgTint: '#D1FAE5',
    icon: ShieldCheck, isWorking: false, isPaused: false,
  },
  reddedildi: {
    label: 'Reddedildi', short: 'RED',
    color: '#DC2626', bgTint: '#FEE2E2',
    icon: AlertOctagon, isWorking: false, isPaused: false,
  },
  skipped: {
    label: 'Atlandı', short: 'ATLANDI',
    color: '#9A9A9A', bgTint: '#F4F4F5',
    icon: SkipForward, isWorking: false, isPaused: false,
  },
};

export function getStageStateMeta(status?: string | null): StageStateMeta {
  if (!status) return STAGE_STATE_META.bekliyor;
  return STAGE_STATE_META[status as StageStatus] ?? STAGE_STATE_META.bekliyor;
}

/** Saniyeyi insan-okur duration'a çevir (35 sn / 12 dk / 1s 40dk / 2g). */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0 dk';
  if (seconds < 60) return `${seconds} sn`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}${autoT('s')} ${m}${autoT('dk')}` : `${h} saat`;
  }
  return `${Math.floor(seconds / 86400)} ${autoT('gün')}`;
}
