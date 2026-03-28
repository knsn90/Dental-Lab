import { StepDefinition } from './types';

export const MANUAL_STEPS: StepDefinition[] = [
  { name: 'receive_impression', label: 'Ölçü Alındı',    order: 1,  requires_approval: false, blocks_on_approval: false },
  { name: 'model_cast',         label: 'Model Dökümü',   order: 2,  requires_approval: false, blocks_on_approval: false },
  { name: 'scan',               label: 'Tarama',         order: 3,  requires_approval: false, blocks_on_approval: false },
  { name: 'design',             label: 'Tasarım',        order: 4,  requires_approval: true,  blocks_on_approval: false },
  { name: 'milling',            label: 'Frezeleme',      order: 5,  requires_approval: false, blocks_on_approval: true  },
  { name: 'sinter',             label: 'Sinterleme',     order: 6,  requires_approval: false, blocks_on_approval: false },
  { name: 'porcelain',          label: 'Porselen',       order: 7,  requires_approval: false, blocks_on_approval: false },
  { name: 'oven',               label: 'Fırın',          order: 8,  requires_approval: false, blocks_on_approval: false },
  { name: 'qc',                 label: 'Kalite Kontrol', order: 9,  requires_approval: false, blocks_on_approval: false },
  { name: 'packaging',          label: 'Paketleme',      order: 10, requires_approval: false, blocks_on_approval: false },
  { name: 'delivery',           label: 'Teslim',         order: 11, requires_approval: false, blocks_on_approval: false },
];

export const DIGITAL_STEPS: StepDefinition[] = [
  { name: 'receive_file', label: 'Dosya Alındı',    order: 1, requires_approval: false, blocks_on_approval: false },
  { name: 'design',       label: 'Tasarım',         order: 2, requires_approval: true,  blocks_on_approval: false },
  { name: 'milling',      label: 'Frezeleme',       order: 3, requires_approval: false, blocks_on_approval: true  },
  { name: 'sinter',       label: 'Sinterleme',      order: 4, requires_approval: false, blocks_on_approval: false },
  { name: 'porcelain',    label: 'Porselen',        order: 5, requires_approval: false, blocks_on_approval: false },
  { name: 'oven',         label: 'Fırın',           order: 6, requires_approval: false, blocks_on_approval: false },
  { name: 'qc',           label: 'Kalite Kontrol',  order: 7, requires_approval: false, blocks_on_approval: false },
  { name: 'packaging',    label: 'Paketleme',       order: 8, requires_approval: false, blocks_on_approval: false },
  { name: 'delivery',     label: 'Teslim',          order: 9, requires_approval: false, blocks_on_approval: false },
];

export const STEP_ICONS: Record<string, string> = {
  receive_impression: '📥',
  model_cast:         '🔲',
  scan:               '🔍',
  receive_file:       '📁',
  design:             '✏️',
  milling:            '⚙️',
  sinter:             '🔥',
  porcelain:          '💎',
  oven:               '♨️',
  qc:                 '✅',
  packaging:          '📦',
  delivery:           '🚚',
};
