export type ClinicCategory = 'klinik' | 'poliklinik' | 'hastane';

export interface Clinic {
  id: string;
  name: string;
  category: ClinicCategory | null;
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
