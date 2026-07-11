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
  rater_id: string;
  rater_role: 'doctor' | 'clinic' | null;
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
