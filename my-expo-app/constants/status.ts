import { WorkOrderStatus } from '../lib/types';
import Colors from './colors';

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
    color: Colors.statusReceived,
    bgColor: Colors.statusReceivedBg,
    next: 'uretimde',
    icon: '📥',
    ionIcon: 'download-outline',
  },
  uretimde: {
    label: 'Üretimde',
    color: Colors.statusProduction,
    bgColor: Colors.statusProductionBg,
    next: 'kalite_kontrol',
    icon: '⚙️',
    ionIcon: 'wrench-outline',
  },
  kalite_kontrol: {
    label: 'Kalite Kontrol',
    color: Colors.statusQC,
    bgColor: Colors.statusQCBg,
    next: 'teslimata_hazir',
    icon: '🔍',
    ionIcon: 'shield-check-outline',
  },
  teslimata_hazir: {
    label: 'Teslimata Hazır',
    color: Colors.statusReady,
    bgColor: Colors.statusReadyBg,
    next: 'teslim_edildi',
    icon: '📦',
    ionIcon: 'cube-outline',
  },
  teslim_edildi: {
    label: 'Teslim Edildi',
    color: Colors.statusDelivered,
    bgColor: Colors.statusDeliveredBg,
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

export function isOverdue(deliveryDate: string, status: WorkOrderStatus): boolean {
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
