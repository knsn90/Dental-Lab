// ─── Production Support OS — Faz 1 ────────────────────────────────────────

export type SupportCategory =
  | 'teknik_sorun'
  | 'stl_dosya'
  | 'uretim_sureci'
  | 'kargo_teslimat'
  | 'faturalama'
  | 'entegrasyon'
  | 'ozellik_egitim'
  | 'yazilim_hatasi'
  | 'kvkk_talebi';

export type SupportPriority = 'dusuk' | 'normal' | 'yuksek' | 'kritik' | 'acil_mudahale';

export type SupportStatus =
  | 'yeni'
  | 'inceleniyor'
  | 'teknik_inceleme'
  | 'klinik_bekleniyor'
  | 'cozuldu'
  | 'kapali';

export type SupportSenderRole = 'user' | 'support';

export type SupportAttachmentKind = 'image' | 'file' | 'screenshot' | 'recording' | 'stl' | 'log';

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  uploader_id: string | null;
  kind: SupportAttachmentKind;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  preview_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SupportContext {
  source?: 'order' | 'stage' | 'upload' | 'cam_export' | 'manual' | string;
  order_id?: string;
  order_number?: string;
  patient_name?: string;
  doctor_name?: string;
  clinic_name?: string;
  stage_key?: string;
  stage_label?: string;
  last_action?: string;
  error_code?: string;
  error_message?: string;
  file_url?: string;
  file_name?: string;
  machine?: string;
  browser?: string;
  device?: string;
  url?: string;
  [key: string]: any;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  lab_id: string | null;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  assignee_id: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  last_message_at: string;
  unread_for_user: boolean;
  unread_for_admin: boolean;
  created_at: string;
  updated_at: string;
  // Production OS additions
  context: SupportContext;
  work_order_id: string | null;
  stage_key: string | null;
  error_code: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  checklist: SupportChecklistItem[];
  resolution: string | null;
  // Join fields
  user?: { full_name?: string | null; email?: string | null } | null;
}

export interface SupportChecklistItem {
  key: string;
  label: string;
  checked: boolean;
  checked_by?: string;
  checked_at?: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: SupportSenderRole;
  body: string;
  attachments: SupportAttachment[];
  is_internal: boolean;
  created_at: string;
  sender?: { full_name?: string | null } | null;
}

export interface SupportStatusHistoryEntry {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  from_status: SupportStatus | null;
  to_status: SupportStatus;
  from_priority: SupportPriority | null;
  to_priority: SupportPriority | null;
  note: string | null;
  created_at: string;
  actor?: { full_name?: string | null } | null;
}

// ─── Label / renk yapılandırması ───────────────────────────────────────────

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  teknik_sorun:    'Teknik Sorun',
  stl_dosya:       'STL / Dosya Problemi',
  uretim_sureci:   'Üretim Süreci',
  kargo_teslimat:  'Kargo & Teslimat',
  faturalama:      'Faturalama',
  entegrasyon:     'Entegrasyon',
  ozellik_egitim:  'Özellik / Eğitim',
  yazilim_hatasi:  'Yazılım Hatası',
  kvkk_talebi:     'KVKK / Veri Talebi',
};

export const PRIORITY_LABELS: Record<SupportPriority, string> = {
  dusuk:          'Düşük',
  normal:         'Normal',
  yuksek:         'Yüksek',
  kritik:         'Kritik',
  acil_mudahale:  'Acil Müdahale',
};

export const STATUS_LABELS: Record<SupportStatus, string> = {
  yeni:               'Yeni',
  inceleniyor:        'İnceleniyor',
  teknik_inceleme:    'Teknik İnceleme',
  klinik_bekleniyor:  'Klinik Bekleniyor',
  cozuldu:            'Çözüm Sağlandı',
  kapali:             'Kapalı',
};

// "Warm gray + graphite + subtle orange" operasyonel paleti
export const PRIORITY_COLORS: Record<SupportPriority, { fg: string; bg: string }> = {
  dusuk:          { fg: '#64748B', bg: 'rgba(100,116,139,0.10)' },
  normal:         { fg: '#475569', bg: 'rgba(71,85,105,0.10)'  },
  yuksek:         { fg: '#B45309', bg: 'rgba(180,83,9,0.10)'   },
  kritik:         { fg: '#C2410C', bg: 'rgba(194,65,12,0.12)'  },
  acil_mudahale:  { fg: '#9F1239', bg: 'rgba(159,18,57,0.12)'  },
};

export const STATUS_COLORS: Record<SupportStatus, { fg: string; bg: string }> = {
  yeni:               { fg: '#C2410C', bg: 'rgba(194,65,12,0.12)'  }, // turuncu — yeni vurgu
  inceleniyor:        { fg: '#475569', bg: 'rgba(71,85,105,0.10)' },
  teknik_inceleme:    { fg: '#1E40AF', bg: 'rgba(30,64,175,0.10)' },
  klinik_bekleniyor:  { fg: '#B45309', bg: 'rgba(180,83,9,0.10)'  },
  cozuldu:            { fg: '#15803D', bg: 'rgba(21,128,61,0.12)' },
  kapali:             { fg: '#64748B', bg: 'rgba(100,116,139,0.10)' },
};

// SLA pencere — saat cinsinden (DB ile uyumlu)
export const SLA_HOURS: Record<SupportPriority, number> = {
  dusuk:         72,
  normal:        24,
  yuksek:        12,
  kritik:         4,
  acil_mudahale:  2,
};

export const ACCENT       = '#0F172A';  // graphite
export const ACCENT_SOFT  = '#F4F0EB';  // warm gray bg
export const ACCENT_ORANGE = '#C2410C'; // subtle orange (only emphasis)
