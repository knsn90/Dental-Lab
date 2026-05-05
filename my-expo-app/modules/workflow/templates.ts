export interface WorkflowStep {
  name: string;
  label: string;
  sequence: number;
}

export const MANUAL_STEPS: WorkflowStep[] = [
  { name: 'olcu_alma', label: 'Ölçü Alma', sequence: 1 },
  { name: 'model_hazirlama', label: 'Model Hazırlama', sequence: 2 },
  { name: 'mumlu_modelleme', label: 'Mumlu Modelleme', sequence: 3 },
  { name: 'doktor_onay', label: 'Doktor Onayı', sequence: 4 },
  { name: 'altyapi', label: 'Altyapı', sequence: 5 },
  { name: 'porselen', label: 'Porselen', sequence: 6 },
  { name: 'bitirme', label: 'Bitirme', sequence: 7 },
  { name: 'kalite_kontrol', label: 'Kalite Kontrol', sequence: 8 },
  { name: 'teslim', label: 'Teslim', sequence: 9 },
];

export const DIGITAL_STEPS: WorkflowStep[] = [
  { name: 'dijital_tarama', label: 'Dijital Tarama', sequence: 1 },
  { name: 'cad_tasarim', label: 'CAD Tasarım', sequence: 2 },
  { name: 'doktor_onay', label: 'Doktor Onayı', sequence: 3 },
  { name: 'cam_frezeleme', label: 'CAM Frezeleme', sequence: 4 },
  { name: 'sinterleme', label: 'Sinterleme', sequence: 5 },
  { name: 'porselen', label: 'Porselen', sequence: 6 },
  { name: 'bitirme', label: 'Bitirme', sequence: 7 },
  { name: 'kalite_kontrol', label: 'Kalite Kontrol', sequence: 8 },
  { name: 'teslim', label: 'Teslim', sequence: 9 },
];

export const STEP_ICONS: Record<string, string> = {
  olcu_alma: '📐',
  model_hazirlama: '🏗',
  mumlu_modelleme: '🕯',
  dijital_tarama: '📷',
  cad_tasarim: '💻',
  doktor_onay: '✅',
  altyapi: '⚙️',
  cam_frezeleme: '🔧',
  sinterleme: '🔥',
  porselen: '🦷',
  bitirme: '✨',
  kalite_kontrol: '🔍',
  teslim: '📦',
};
