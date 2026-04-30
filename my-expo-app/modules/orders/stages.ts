// modules/orders/stages.ts
// "Cards" ERP — sabit stage akışı + per-stage checklist tanımları.
// Bu dosya tüm workflow mantığının tek kaynağıdır.
//
// Migration 047: CHECK → TRIAGE rename. MANAGER_REVIEW conditional gate.
// "required" flag = fast-track durumunda bile zorunlu olan kritik maddeler.

export type Stage =
  | 'TRIAGE'
  | 'MANAGER_REVIEW'
  | 'DESIGN'
  | 'DOCTOR_APPROVAL'
  | 'CAM'
  | 'MILLING'
  | 'SINTER'
  | 'FINISH'
  | 'QC'
  | 'SHIPPED';

/** Sabit sıralı stage akışı. MANAGER_REVIEW + DOCTOR_APPROVAL conditional. */
export const STAGE_ORDER: Stage[] = [
  'TRIAGE',
  'MANAGER_REVIEW',
  'DESIGN',
  'DOCTOR_APPROVAL',
  'CAM',
  'MILLING',
  'SINTER',
  'FINISH',
  'QC',
  'SHIPPED',
];

export const STAGE_LABEL: Record<Stage, string> = {
  TRIAGE:           'Triyaj',
  MANAGER_REVIEW:   'Müdür Onayı',
  DESIGN:           'Tasarım',
  DOCTOR_APPROVAL:  'Hekim Onayı',
  CAM:              'CAM',
  MILLING:          'Frezeleme',
  SINTER:           'Sinterleme',
  FINISH:           'Bitiş',
  QC:               'Kalite Kontrol',
  SHIPPED:          'Teslim',
};

export const STAGE_COLOR: Record<Stage, string> = {
  TRIAGE:           '#94A3B8',
  MANAGER_REVIEW:   '#DC2626',
  DESIGN:           '#7C3AED',
  DOCTOR_APPROVAL:  '#F59E0B',
  CAM:              '#3B82F6',
  MILLING:          '#2563EB',
  SINTER:           '#0891B2',
  FINISH:           '#059669',
  QC:               '#A855F7',
  SHIPPED:          '#10B981',
};

// ── Per-stage checklists ────────────────────────────────────────────────────
// "Complete" butonu ZORUNLU (required=true) tüm tikler dolu olana dek disabled.
// Fast-track TRIAGE = sadece required item'lar ile geçilebilir.

export interface ChecklistItem {
  key:       string;
  label:     string;
  hint?:     string;
  required?: boolean; // default true; false = optional (fast-track friendly)
}

export const STAGE_CHECKLIST: Record<Stage, ChecklistItem[]> = {
  TRIAGE: [
    { key: 'order_complete',   label: 'Sipariş bilgileri eksiksiz',   required: true  },
    { key: 'measurement_file', label: 'Ölçü dosyası mevcut',          required: true  },
    { key: 'tooth_numbers',    label: 'Diş numaraları net',           required: true  },
    { key: 'patient_ok',       label: 'Hasta bilgileri doğru',        required: false },
  ],
  MANAGER_REVIEW: [
    { key: 'case_understood',  label: 'Vaka detayları anlaşıldı',     required: true  },
    { key: 'risks_identified', label: 'Risk noktaları belirlendi',    required: true  },
    { key: 'doctor_aligned',   label: 'Doktor ile mutabık kalındı',   required: false },
  ],
  DESIGN: [
    { key: 'margin_ok',      label: 'Margin çizimi doğru',                              required: true },
    { key: 'die_spacing_ok', label: 'Die spacing doğru', hint: '30–50 µm',              required: true },
    { key: 'contacts_ok',    label: 'Kontaklar (mesial/distal) ayarlı',                 required: true },
    { key: 'occlusion_ok',   label: 'Oklüzyon clearance uygun',                         required: true },
    { key: 'anatomy_ok',     label: 'Anatomi / emergence profile uygun',                required: true },
    { key: 'stl_export_ok',  label: 'STL export kontrol edildi',                        required: true },
  ],
  DOCTOR_APPROVAL: [],
  CAM: [
    { key: 'block_size_ok',  label: 'Blok boyutu uygun',     required: true },
    { key: 'sprue_ok',       label: 'Sprue konumu doğru',    required: true },
    { key: 'nesting_ok',     label: 'Nesting onaylandı',     required: true },
    { key: 'simulation_ok',  label: 'Simülasyon başarılı',   required: true },
  ],
  MILLING: [
    { key: 'tool_ok',        label: 'Frez seti doğru',                       required: true },
    { key: 'block_loaded',   label: 'Blok makineye yüklü',                   required: true },
    { key: 'mill_complete',  label: 'Frezeleme tamamlandı',                  required: true },
    { key: 'visual_ok',      label: 'Görsel kontrol — kırık/çatlak yok',     required: true },
  ],
  SINTER: [
    { key: 'cleaned_ok',     label: 'Yapılar temizlendi',     required: true },
    { key: 'furnace_set',    label: 'Fırın programı doğru',   required: true },
    { key: 'sinter_done',    label: 'Sinterleme tamamlandı',  required: true },
    { key: 'shrinkage_ok',   label: 'Çekme kontrol edildi',   required: true },
  ],
  FINISH: [
    { key: 'glaze_ok',       label: 'Glazür / cila uygulandı',   required: true },
    { key: 'shade_ok',       label: 'Renk uyumu doğru',          required: true },
    { key: 'fit_ok',         label: 'Model üstü uyum kontrol',   required: true },
  ],
  QC: [
    { key: 'final_visual',   label: 'Görsel — yüzey, renk, kırık',           required: true },
    { key: 'fit_test',       label: 'Uyum testi (oklüzyon + kontak)',        required: true },
    { key: 'shade_match',    label: 'Renk eşleşmesi',                        required: true },
    { key: 'packaging_ok',   label: 'Paketleme tamam',                       required: false },
  ],
  SHIPPED: [],
};

// ── Stage transitions ────────────────────────────────────────────────────────

export function getNextStage(
  current: Stage,
  doctorApprovalRequired = false,
  managerReviewRequired = false,
): Stage | null {
  if (current === 'TRIAGE') {
    return managerReviewRequired ? 'MANAGER_REVIEW' : 'DESIGN';
  }
  if (current === 'MANAGER_REVIEW') {
    return 'DESIGN';
  }
  if (current === 'DESIGN') {
    return doctorApprovalRequired ? 'DOCTOR_APPROVAL' : 'CAM';
  }
  if (current === 'DOCTOR_APPROVAL') {
    return 'CAM';
  }
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx === STAGE_ORDER.length - 1) return null;
  let next = STAGE_ORDER[idx + 1];
  // Conditional stage'leri atla
  while (next === 'MANAGER_REVIEW' || next === 'DOCTOR_APPROVAL') {
    const ni = STAGE_ORDER.indexOf(next);
    next = STAGE_ORDER[ni + 1];
    if (!next) return null;
  }
  return next ?? null;
}

/** Fast-track yardımcı: doctor_score yüksekse sadece required maddeler zorunlu sayılır. */
export function requiredChecklistItems(stage: Stage, fastTrack = false): ChecklistItem[] {
  const items = STAGE_CHECKLIST[stage] ?? [];
  if (fastTrack) return items.filter(i => i.required !== false);
  return items;
}

/** Doktor skoruna göre TRIAGE fast-track eşiği. */
export const FAST_TRACK_DOCTOR_SCORE = 85;

/** Eski work_orders.status enum'unu yeni Stage'e map'le (geriye dönük uyum). */
export function legacyStatusToStage(status: string): Stage {
  switch (status) {
    case 'alindi':
    case 'atama_bekleniyor':  return 'TRIAGE';
    case 'asamada':
    case 'uretimde':          return 'DESIGN';
    case 'kalite_kontrol':    return 'QC';
    case 'teslimata_hazir':   return 'FINISH';
    case 'teslim_edildi':     return 'SHIPPED';
    default:                  return 'TRIAGE';
  }
}
