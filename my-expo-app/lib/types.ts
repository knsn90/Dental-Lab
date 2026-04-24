export type UserType = 'lab' | 'doctor' | 'admin' | 'clinic_admin';
export type LabRole = 'technician' | 'manager';
export type MachineType = 'milling' | '3d_printing';
export type WorkOrderStatus =
  | 'alindi'
  | 'uretimde'
  | 'kalite_kontrol'
  | 'teslimata_hazir'
  | 'teslim_edildi';

export interface Profile {
  id: string;
  user_type: UserType;
  full_name: string;
  clinic_name: string | null;
  /** clinics.id — klinik müdürü + çoklu hekim klinikte çalışan hekim için (033_clinic_panel). Bireysel hekim için NULL. */
  clinic_id?: string | null;
  role: LabRole | null;
  phone: string | null;
  email?: string | null;
  is_active: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  lab_id?: string | null;      // çok-kiracılı (012_multi_tenancy)
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

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
  department: string | null;
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
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  doctor?: { id?: string; full_name: string; phone?: string | null; clinic_name?: string | null; clinic?: { id?: string; name: string } | null };
  assignee?: Profile;
  photos?: WorkOrderPhoto[];
  status_history?: StatusHistory[];
  order_items?: OrderItem[];
}

export interface LabService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
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

export interface WorkOrderPhoto {
  id: string;
  work_order_id: string;
  storage_path: string;
  uploaded_by: string;
  caption: string | null;
  created_at: string;
  tooth_number: number | null; // FDI tooth number this file belongs to (null = general)
  signed_url?: string; // populated client-side after getSignedUrl
}

export interface StatusHistory {
  id: string;
  work_order_id: string;
  changed_by: string;
  old_status: WorkOrderStatus | null;
  new_status: WorkOrderStatus;
  note: string | null;
  created_at: string;
  changer?: Profile;
}

export interface NewWorkOrderForm {
  patient_name: string;
  patient_id: string;
  department: string;
  tags: string[];
  tooth_numbers: number[];
  work_type: string;
  shade: string;
  machine_type: MachineType;
  notes: string;
  delivery_date: Date;
  photo_uris: string[]; // local URIs before upload
}

export const DEPARTMENTS = [
  'Sabit Protez',
  'Hareketli Protez',
  'İmplant',
  'Ortodonti',
  'CAD/CAM',
  'Seramik',
] as const;

export const ORDER_TAGS = [
  'Öncelikli',
  'Acil',
  'Tekrar',
  'Onay Bekliyor',
  'VIP',
] as const;

export interface Clinic {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Doctor {
  id: string;
  clinic_id: string | null;
  full_name: string;
  phone: string | null;
  specialty: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  clinic?: Clinic;
}

export type ProvaStatus = 'planlandı' | 'gönderildi' | 'döndü' | 'tamamlandı';
export type ProvaType = 'bisküvi' | 'metal' | 'seramik' | 'bitmek' | 'teslim';

export const PROVA_TYPES: { value: ProvaType; label: string; emoji: string; color: string; bg: string }[] = [
  { value: 'bisküvi',  label: 'Bisküvi Prova',  emoji: '🟤', color: '#92400E', bg: '#FEF3C7' },
  { value: 'metal',    label: 'Metal Prova',     emoji: '⚙️',  color: '#374151', bg: '#F3F4F6' },
  { value: 'seramik',  label: 'Seramik Prova',   emoji: '💎',  color: '#1D4ED8', bg: '#EFF6FF' },
  { value: 'bitmek',   label: 'Bitmek Prova',    emoji: '🔍',  color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'teslim',   label: 'Teslim',          emoji: '✅',  color: '#059669', bg: '#ECFDF5' },
];

export interface Prova {
  id: string;
  work_order_id: string;
  order_item_id: string | null;
  order_item_name: string | null;
  prova_number: number;
  prova_type: ProvaType | null;
  scheduled_date: string | null;
  sent_date: string | null;
  return_date: string | null;
  quota: number | null;
  doctor_notes: string | null;
  lab_notes: string | null;
  status: ProvaStatus;
  created_by: string | null;
  created_at: string;
}
