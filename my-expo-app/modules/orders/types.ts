export type WorkOrderStatus =
  | 'alindi'
  | 'uretimde'
  | 'kalite_kontrol'
  | 'teslimata_hazir'
  | 'teslim_edildi';

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
}

export interface PendingItem {
  service_id?: string;
  name: string;
  price: number;
  quantity: number;
}
