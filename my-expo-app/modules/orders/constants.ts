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

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  atama_bekleniyor: {
    label: 'Atama Bekliyor',
    color: '#94A3B8',
    bgColor: '#F1F5F9',
    next: 'alindi',
    icon: '⏳',
    ionIcon: 'clock-outline',
  },
  // Yeni: iş aktif istasyonda — tüm stage'ler bitince otomatik kalite_kontrol'e geçer
  asamada: {
    label: 'Üretim Aşaması',
    color: '#D97706',
    bgColor: '#FEF3C7',
    next: 'kalite_kontrol',
    icon: '🔧',
    ionIcon: 'hammer-wrench',
  },
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
    label: 'Final QC',
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
  return STATUS_CONFIG[status]?.next ?? null;
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

// ─── Auto-derive department from work type (internal only, not shown to user) ─
const CATEGORY_TO_DEPARTMENT: Record<OpCategory, string> = {
  crown_bridge: 'Sabit Protez',
  implant:      'İmplant',
  aesthetic:    'CAD/CAM',
  removable:    'Hareketli Protez',
  surgical:     'Sabit Protez',
  other:        'Sabit Protez',
};

export function deriveDepartment(workType: string): string | undefined {
  const cat = OP_CATEGORY[workType];
  return cat ? CATEGORY_TO_DEPARTMENT[cat] : undefined;
}

// ─── Operation field config ──────────────────────────────────────────────────
export type OpCategory =
  | 'crown_bridge'  // shade
  | 'implant'       // implant system + abutment + screw
  | 'aesthetic'     // shade
  | 'removable'     // material
  | 'surgical'      // no extra fields
  | 'other';

export const OP_CATEGORY: Record<string, OpCategory> = {
  'Zirkonyum Kron':                    'crown_bridge',
  'Zirkonyum Köprü':                   'crown_bridge',
  'Metal Destekli Porselen Kron':      'crown_bridge',
  'Metal Destekli Porselen Köprü':     'crown_bridge',
  'Tam Seramik Kron (e.max)':          'crown_bridge',
  'Tam Seramik Köprü (e.max)':         'crown_bridge',
  'İmplant Üstü Kron (Zirkonyum)':     'implant',
  'İmplant Üstü Kron (Metal-Seramik)': 'implant',
  'İnley / Onley':                     'aesthetic',
  'Veneer':                            'aesthetic',
  'Geçici Kron (3D Baskı)':            'crown_bridge',
  'Geçici Köprü (3D Baskı)':           'crown_bridge',
  'Cerrahi Şablon':                    'surgical',
  'Hareketli Bölümlü Protez':          'removable',
  'Tam Protez':                        'removable',
  'Gece Plağı':                        'other',
  'Diğer':                             'other',
};

export const IMPLANT_SYSTEMS = ['Straumann', 'Nobel', 'Osstem', 'Zimmer', 'Dentsply', 'Megagen', 'Diğer'] as const;
export const ABUTMENT_TYPES  = ['Anatomik', 'Düz', 'Açılı (Angled)', 'Ti-base', 'Zirkonyum'] as const;
export const SCREW_TYPES     = ['Multi-unit', 'Tekli', 'Hex'] as const;
export const REMOVABLE_MATS  = ['Akrilik', 'Krom-Kobalt', 'Flexible (Valplast)', 'Diğer'] as const;
export const CROWN_MATERIALS = ['Monolitik', 'Katmanlı (Layered)'] as const;

// ─── 3-step Work Type Tree ────────────────────────────────────────────────────
export interface WorkTypeNode {
  label: string;
  icon: string;
  subtypes: { value: string; label: string }[];
}

export const WORK_TYPE_TREE: WorkTypeNode[] = [
  {
    label: 'Kron',
    icon: 'crown',
    subtypes: [
      { value: 'Zirkonyum Kron',              label: 'Zirkonyum' },
      { value: 'Metal Destekli Porselen Kron', label: 'Metal Destekli' },
      { value: 'Tam Seramik Kron (e.max)',     label: 'E.max' },
      { value: 'Geçici Kron (3D Baskı)',       label: 'Geçici (3D)' },
    ],
  },
  {
    label: 'Köprü',
    icon: 'bridge',
    subtypes: [
      { value: 'Zirkonyum Köprü',              label: 'Zirkonyum' },
      { value: 'Metal Destekli Porselen Köprü', label: 'Metal Destekli' },
      { value: 'Tam Seramik Köprü (e.max)',     label: 'E.max' },
      { value: 'Geçici Köprü (3D Baskı)',       label: 'Geçici (3D)' },
    ],
  },
  {
    label: 'İmplant',
    icon: 'needle',
    subtypes: [
      { value: 'İmplant Üstü Kron (Zirkonyum)',     label: 'Zirkonyum Kron' },
      { value: 'İmplant Üstü Kron (Metal-Seramik)', label: 'Metal-Seramik' },
    ],
  },
  {
    label: 'Veneer',
    icon: 'shimmer',
    subtypes: [
      { value: 'Veneer',        label: 'Veneer' },
      { value: 'İnley / Onley', label: 'İnley / Onley' },
    ],
  },
  {
    label: 'Protez',
    icon: 'set-all',
    subtypes: [
      { value: 'Hareketli Bölümlü Protez', label: 'Bölümlü' },
      { value: 'Tam Protez',               label: 'Tam Protez' },
      { value: 'Gece Plağı',               label: 'Gece Plağı' },
    ],
  },
  {
    label: 'Diğer',
    icon: 'dots-horizontal',
    subtypes: [
      { value: 'Cerrahi Şablon', label: 'Cerrahi Şablon' },
      { value: 'Diğer',          label: 'Diğer' },
    ],
  },
];

// Reverse map: work_type value → ana tip label (breadcrumb için)
export const WORK_TYPE_MAIN: Record<string, string> = {};
WORK_TYPE_TREE.forEach(node => {
  node.subtypes.forEach(sub => { WORK_TYPE_MAIN[sub.value] = node.label; });
});

// ─── Order Tags ───────────────────────────────────────────────────────────────
export const ORDER_TAGS = [
  'Öncelikli',
  'Acil',
  'Tekrar',
  'Onay Bekliyor',
  'VIP',
] as const;
