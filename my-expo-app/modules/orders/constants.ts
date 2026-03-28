import { WorkOrderStatus } from './types';

// ─── Work Types ──────────────────────────────────────────────────────────────
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

// ─── Shades ──────────────────────────────────────────────────────────────────
// Vita Classical shade guide
export const VITA_SHADES = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
] as const;

// Vita 3D-Master shade guide
export const VITA_3D_SHADES = [
  '0M1', '0M2', '0M3',
  '1M1', '1M2',
  '2L1.5', '2L2.5', '2M1', '2M2', '2M3', '2R1.5', '2R2.5',
  '3L1.5', '3L2.5', '3M1', '3M2', '3M3', '3R1.5', '3R2.5',
  '4L1.5', '4L2.5', '4M1', '4M2', '4M3', '4R1.5', '4R2.5',
  '5M1', '5M2', '5M3',
] as const;

export const ALL_SHADES = [...VITA_SHADES, ...VITA_3D_SHADES] as const;
export type Shade = (typeof ALL_SHADES)[number];

// ─── Status Config ───────────────────────────────────────────────────────────
export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  next: WorkOrderStatus | null;
  icon: string;
  ionIcon: string;
}

export const STATUS_CONFIG: Record<WorkOrderStatus, StatusConfig> = {
  alindi: {
    label: 'Alındı',
    color: '#2563EB',
    bgColor: '#DBEAFE',
    next: 'uretimde',
    icon: '📥',
    ionIcon: 'download-outline',
  },
  uretimde: {
    label: 'Üretimde',
    color: '#D97706',
    bgColor: '#FEF3C7',
    next: 'kalite_kontrol',
    icon: '⚙️',
    ionIcon: 'wrench-outline',
  },
  kalite_kontrol: {
    label: 'Kalite Kontrol',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    next: 'teslimata_hazir',
    icon: '🔍',
    ionIcon: 'shield-check-outline',
  },
  teslimata_hazir: {
    label: 'Teslimata Hazır',
    color: '#059669',
    bgColor: '#D1FAE5',
    next: 'teslim_edildi',
    icon: '📦',
    ionIcon: 'cube-outline',
  },
  teslim_edildi: {
    label: 'Teslim Edildi',
    color: '#374151',
    bgColor: '#F3F4F6',
    next: null,
    icon: '✅',
    ionIcon: 'check-circle-outline',
  },
};

export const STATUS_ORDER: WorkOrderStatus[] = [
  'alindi',
  'uretimde',
  'kalite_kontrol',
  'teslimata_hazir',
  'teslim_edildi',
];

export function getStatusConfig(status: WorkOrderStatus): StatusConfig {
  return STATUS_CONFIG[status];
}

export function getNextStatus(status: WorkOrderStatus): WorkOrderStatus | null {
  return STATUS_CONFIG[status].next;
}

export function isOrderOverdue(deliveryDate: string, status: WorkOrderStatus): boolean {
  if (status === 'teslim_edildi') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(deliveryDate) < today;
}

export function formatDeliveryDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Departments ─────────────────────────────────────────────────────────────
export const DEPARTMENTS = [
  'Sabit Protez',
  'Hareketli Protez',
  'İmplant',
  'Ortodonti',
  'CAD/CAM',
  'Seramik',
] as const;

// ─── Order Tags ───────────────────────────────────────────────────────────────
export const ORDER_TAGS = [
  'Öncelikli',
  'Acil',
  'Tekrar',
  'Onay Bekliyor',
  'VIP',
] as const;
