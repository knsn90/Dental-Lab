// Teslim edilen iş değerlendirmesi (hekim/klinik → iş). Faz 1.

/** Dental QC boyut anahtarları (order_reviews kolonlarıyla birebir). */
export type ReviewDimensionKey =
  | 'fit'        // Marjinal Uyum
  | 'occlusion'  // Oklüzyon / Kapanış
  | 'contacts'   // Kontakt Noktaları
  | 'esthetics'  // Estetik / Renk
  | 'surface'    // Yüzey / Polisaj
  | 'on_time';   // Zamanında Teslim

export interface OrderReview {
  id: string;
  work_order_id: string;
  lab_id: string;
  rater_id: string | null;                // WhatsApp klinik hattından gelen cevapta boş
  rater_role: 'doctor' | 'clinic' | null;
  source: 'app' | 'whatsapp';
  rater_doctor_id: string | null;
  overall: number;                       // 1–5 (zorunlu)
  fit: number | null;
  occlusion: number | null;
  contacts: number | null;
  esthetics: number | null;
  surface: number | null;
  on_time: number | null;
  comment: string | null;
  photos: string[];                // genel storage path'leri (Faz 5)
  clinical_photos: string[];       // ağız içi (klinik) fotoğraflar — lab için değerli
  lab_reply: string | null;        // lab yanıtı (Faz 5)
  lab_reply_at: string | null;
  lab_reply_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Değerlendirilmeyi bekleyen teslim edilmiş iş (Faz 2 kart listesi). */
export interface PendingReviewOrder {
  id: string;
  order_number: string;
  patient_name: string | null;
  work_type: string | null;
  delivery_date: string | null;
}

/** Form gönderiminde kullanılan girdiler (boyutlar opsiyonel). */
export interface ReviewInput {
  work_order_id: string;
  overall: number;
  fit?: number | null;
  occlusion?: number | null;
  contacts?: number | null;
  esthetics?: number | null;
  surface?: number | null;
  on_time?: number | null;
  comment?: string | null;
  photos?: string[];
  clinical_photos?: string[];
  rater_role?: 'doctor' | 'clinic' | null;
}

// ── Değerlendirmeler ekranı (get_review_dashboard dönüşü; anahtarlar sunucuyla birebir) ──

/** Genel puan + altı boyut. */
export type ScoreKey = 'overall' | ReviewDimensionKey;

export interface ReviewDashboardSummary {
  avg: number | null;
  count: number;
  low_count: number;
  prev_avg: number | null;
  /** Ayda teslim edilmiş, 14 günü dolmuş işler / 14 gün içinde puanlananlar. Teslim yoksa null. */
  rate: { delivered: number; reviewed: number } | null;
  /** Lab'ın hiç değerlendirmesi var mı (boş durum metni için). */
  has_any: boolean;
}

export interface ReviewClinicRow {
  /** `c:<clinic_id>` ya da kliniksiz hekim için `d:<doctor_id>`. */
  key: string;
  kind: 'clinic' | 'doctor';
  name: string | null;
  /** Son 6 ay, eskiden yeniye aylık ortalama; puansız ay null. */
  series: (number | null)[];
  counts: number[];
  month_avg: number | null;
  month_count: number;
  month_low: number;
  /** Seçili aydan önceki 3 takvim ayının tüm puanlarının ortalaması. */
  prev3_avg: number | null;
}

export interface ReviewDashRow {
  work_order_id: string;
  order_number: string | null;
  clinic_key: string;
  clinic_name: string | null;
  doctor_name: string | null;
  work_type_label: string | null;
  created_at: string;
  source: 'app' | 'whatsapp';
  overall: number;
  fit: number | null;
  occlusion: number | null;
  contacts: number | null;
  esthetics: number | null;
  surface: number | null;
  on_time: number | null;
  comment: string | null;
  /** WhatsApp düğme cevabı (1/3/5) ya da null. */
  wa_answer: number | null;
  /** Etkin en düşük puan (WhatsApp 1/3 dahil). */
  cur_min: number | null;
}

/** Arama kaydı alanları (review_followup_set_call dönüşü). */
export interface ReviewCallState {
  called_at: string | null;
  called_by_name: string | null;
  call_note: string | null;
  note_updated_at: string | null;
  note_updated_by_name: string | null;
  /** "Aranmadı": düşük ve bu dönemde aranmamış. */
  is_open: boolean;
  /** Açık ama daha önceki bir dönemde aranmış. */
  previous_call: boolean;
}

export interface ReviewLowRow extends ReviewDashRow, ReviewCallState {
  /** Kliniğin telefonu, yoksa hekiminki; ikisi de yoksa null. */
  phone: string | null;
  period_started_at: string | null;
}

export interface ReviewDashboard {
  /** 'YYYY-MM-01' */
  month: string;
  summary: ReviewDashboardSummary;
  clinics: ReviewClinicRow[];
  reviews: ReviewDashRow[];
  lows: ReviewLowRow[];
}

export type ReviewCallAction = 'mark' | 'note' | 'unmark';
