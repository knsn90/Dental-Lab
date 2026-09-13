export type WorkOrderStatus =
  | 'alindi'
  | 'uretimde'
  | 'kalite_kontrol'
  | 'teslimata_hazir'
  | 'teslim_edildi'
  | 'iptal';

export type MachineType = 'milling' | '3d_printing';
export type PatientGender = 'erkek' | 'kadın' | 'belirtilmedi';
export type ModelType = 'dijital' | 'fiziksel' | 'fotograf' | 'cad';

export interface WorkOrder {
  id: string;
  order_number: string;
  doctor_id: string;
  assigned_to: string | null;
  patient_name: string | null;
  patient_id: string | null;
  patient_gender: PatientGender | null;
  patient_dob: string | null;      // YYYY-MM-DD
  patient_phone: string | null;
  patient_nationality: string | null;
  patient_country: string | null;
  patient_city: string | null;
  lab_notes_visible: boolean;
  tags: string[];
  tooth_numbers: number[];
  work_type: string;
  shade: string | null;
  machine_type: MachineType;
  model_type: ModelType | null;
  is_urgent: boolean;
  status: WorkOrderStatus;
  notes: string | null;       // doctor-visible notes
  lab_notes: string | null;   // internal lab notes
  delivery_date: string;
  delivered_at: string | null;
  delivery_method: 'kurye' | 'kargo' | 'elden' | null; // teslim şekli (sipariş oluştururken seçilir)
  triaged_at: string | null;       // Planlama tamamlandığında set edilir (triage_order RPC)
  triaged_by: string | null;       // Planlamayı yapan profile id'si
  is_archived?: boolean;            // Admin pasife aldıysa true
  archived_at?: string | null;
  archived_by?: string | null;
  // ── İşi Beklet (hold) — lab kaynaklı olmayan bekleme gecikmeye yazılmasın ──
  /** 'on_hold' = iş beklemede (gecikme sayacı durur). null = normal akış. */
  hold_status?: 'on_hold' | null;
  hold_reason?: string | null;
  hold_category?: string | null;
  /** 'client' → devam ettirince teslim tarihi bekleme kadar ötelenir; 'lab' → ötelenmez */
  hold_responsible?: 'client' | 'lab' | null;
  hold_started_at?: string | null;
  hold_by?: string | null;
  // ── İmplant (yapısal alanlar; eski kayıtlarda null → order_items.notes fallback) ──
  implant_brand?: string | null;
  implant_teeth?: number[] | null;
  implant_details?: Record<string, ImplantDetail> | null;
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  doctor?: { id?: string; full_name: string; phone?: string | null; clinic_name?: string | null; clinic?: { id?: string; name: string } | null };
  assignee?: import('../../lib/types').Profile;
  photos?: import('../../lib/types').WorkOrderPhoto[];
  status_history?: import('../../lib/types').StatusHistory[];
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  work_order_id: string;
  service_id: string | null;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  created_at: string;
}

export interface CreateWorkOrderParams {
  doctor_id: string;
  patient_name?: string;
  patient_id?: string;
  patient_gender?: string;
  patient_dob?: string;       // YYYY-MM-DD, optional
  patient_phone?: string;
  /** Auto-derived from work_type — not exposed in UI */
  department?: string;
  tags?: string[];
  tooth_numbers: number[];
  work_type: string;
  shade?: string;
  machine_type: MachineType;
  model_type?: string;
  is_urgent?: boolean;
  notes?: string;
  lab_notes?: string;
  delivery_date: string; // YYYY-MM-DD
  delivery_method?: 'kurye' | 'kargo' | 'elden'; // teslim şekli
  measurement_type?: 'manual' | 'digital';
  doctor_approval_required?: boolean;
  patient_nationality?: string;
  patient_country?: string;
  patient_city?: string;
  lab_notes_visible?: boolean;
  scan_bodies_delivered?: boolean;
  /** Vakanın genel implant markası (sihirbaz adım 4). Diş bazlı marka implant_details'te. */
  implant_brand?: string | null;
  /** İmplant bulunan diş pozisyonları (FDI) — fiyata etki etmez, üretim bilgisidir. */
  implant_teeth?: number[] | null;
  /** Diş bazlı implant detayı: { "23": { system, type, abutment, screw } } */
  implant_details?: Record<string, ImplantDetail> | null;
  /** Devam siparişi — bu iş emri, teslim edilmiş başka bir siparişin planlı devamı
   *  (ör. geçici→nihai). Revizyon DEĞİL. Bkz. work_orders.continues_order_id. */
  continues_order_id?: string | null;
}

/** Tek bir dişteki implant bilgisi (work_orders.implant_details değeri). */
export interface ImplantDetail {
  system: string;
  type: string;
  abutment: string;
  screw: string;
}

export interface PendingItem {
  service_id?: string;
  name: string;
  price: number;
  quantity: number;
}
